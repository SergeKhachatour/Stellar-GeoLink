/**
 * Background AI Service
 * 
 * Processes location updates and matches them with contract execution rules
 * Uses Azure OpenAI (same as frontend GeoLink Agent) for intelligent rule matching
 * Users can maintain AI sessions with background processes
 */

const pool = require('../config/database');
const azureOpenAIService = require('./azureOpenAIService');
const contractIntrospection = require('./contractIntrospection');

class BackgroundAIService {
  constructor() {
    this.processingInterval = null;
    this.isProcessing = false;
  }

  /**
   * Start the background processing worker
   * Processes location updates from the queue
   */
  start(intervalMs = 5000) {
    if (this.processingInterval) {
      console.log('[BackgroundAI] ⚠️  Worker already running');
      return;
    }

    console.log(`[BackgroundAI] 🚀 Starting background AI worker (interval: ${intervalMs}ms)`);
    
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processLocationUpdateQueue();
      }
    }, intervalMs);
  }

  /**
   * Stop the background processing worker
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('[BackgroundAI] ⏹️  Background AI worker stopped');
    }
  }

  /**
   * Process pending location updates from the queue
   */
  async processLocationUpdateQueue() {
    const startTime = Date.now();
    try {
      this.isProcessing = true;
      console.log(`[BackgroundAI] 🔄 Starting queue processing cycle at ${new Date().toISOString()}`);

      // First, mark superseded updates (older updates for same public_key)
      // Since updates come every 5 seconds, we only want to process the latest
      const supersededResult = await pool.query('SELECT mark_superseded_location_updates()');
      const supersededCount = supersededResult.rows[0]?.mark_superseded_location_updates || 0;
      if (supersededCount > 0) {
        console.log(`[BackgroundAI] ⏭️  Marked ${supersededCount} superseded location update(s) as skipped`);
      }

      // Get pending location updates (only latest per public_key)
      const result = await pool.query(
        `SELECT * FROM process_location_update_queue()`
      );

      if (result.rows.length === 0) {
        console.log(`[BackgroundAI] ✅ Queue processing complete - No pending updates (took ${Date.now() - startTime}ms)`);
        return; // No pending updates
      }

      console.log(`[BackgroundAI] 📍 Processing ${result.rows.length} location update(s) (latest per public_key)`);
      console.log(`[BackgroundAI] 📋 Update details:`, result.rows.map(u => ({
        update_id: u.update_id,
        public_key: u.public_key?.substring(0, 8) + '...',
        location: `(${u.latitude}, ${u.longitude})`,
        user_id: u.user_id
      })));

      for (const update of result.rows) {
        const updateStartTime = Date.now();
        console.log(`[BackgroundAI] 🔍 Processing update ${update.update_id} for public_key ${update.public_key?.substring(0, 8)}...`);
        await this.processLocationUpdate(update);
        console.log(`[BackgroundAI] ✅ Completed update ${update.update_id} (took ${Date.now() - updateStartTime}ms)`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`[BackgroundAI] ✅ Queue processing complete - Processed ${result.rows.length} update(s) in ${totalTime}ms`);
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error processing location update queue:', error);
      console.error('[BackgroundAI] ❌ Error stack:', error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single location update
   */
  async processLocationUpdate(update) {
    const { update_id, user_id, public_key, latitude, longitude } = update;
    const processStartTime = Date.now();

    try {
      console.log(`[BackgroundAI] 📥 Processing location update ${update_id}:`, {
        user_id,
        public_key: public_key?.substring(0, 8) + '...',
        queue_location: `(${latitude}, ${longitude})`,
        received_at: update.received_at
      });

      // Mark as processing
      await pool.query('SELECT mark_location_update_processing($1)', [update_id]);
      console.log(`[BackgroundAI] ✅ Marked update ${update_id} as processing`);

      // Get latest location directly from wallet_locations table (avoiding function call issue)
      const locationFetchStartTime = Date.now();
      const latestLocation = await pool.query(
        `SELECT latitude, longitude 
         FROM wallet_locations 
         WHERE public_key = $1 
           AND blockchain = $2 
           AND location_enabled = true
         ORDER BY last_updated DESC 
         LIMIT 1`,
        [public_key, 'Stellar']
      );
      
      // Use latest location if available, otherwise use queue data
      const actualLatitude = latestLocation.rows[0]?.latitude || latitude;
      const actualLongitude = latestLocation.rows[0]?.longitude || longitude;
      const isUsingLatest = !!latestLocation.rows[0];
      
      console.log(`[BackgroundAI] 📍 Location data:`, {
        queue_location: `(${latitude}, ${longitude})`,
        latest_location: latestLocation.rows[0] ? `(${latestLocation.rows[0].latitude}, ${latestLocation.rows[0].longitude})` : 'N/A',
        using: isUsingLatest ? 'latest from wallet_locations' : 'queue data',
        final_location: `(${actualLatitude}, ${actualLongitude})`,
        fetch_took: `${Date.now() - locationFetchStartTime}ms`
      });
      
      // Get all active contract execution rules for this user using latest location
      // Rules are already filtered by location/proximity in the query
      const rulesFetchStartTime = Date.now();
      const rules = await this.getActiveRulesForLocation(user_id, actualLatitude, actualLongitude, public_key);
      console.log(`[BackgroundAI] 📋 Rules query:`, {
        found_rules: rules.length,
        rule_ids: rules.map(r => r.id),
        rule_names: rules.map(r => r.rule_name),
        took: `${Date.now() - rulesFetchStartTime}ms`
      });

      if (rules.length === 0) {
        console.log(`[BackgroundAI] ℹ️  No active rules found for location update ${update_id} - Skipping`);
        await pool.query(
          'SELECT complete_location_update_processing($1, $2)',
          [update_id, 'skipped']
        );
        return;
      }

      // Direct rule execution without AI analysis
      // Since rules are already filtered by location/proximity, we can execute them directly
      console.log(`[BackgroundAI] ⚡ Executing ${rules.length} contract rule(s) directly (no AI analysis)...`);
      const executionResults = [];
      const matchedRuleIds = [];
      
      for (const rule of rules) {
        const executionStartTime = Date.now();
        
        // Check if WebAuthn is required for this rule
        // WebAuthn requires browser-based user interaction, so we can't execute it automatically
        const functionParams = typeof rule.function_parameters === 'string'
          ? JSON.parse(rule.function_parameters)
          : rule.function_parameters || {};
        
        const webauthnParamNames = [
          'webauthn_signature',
          'webauthn_authenticator_data',
          'webauthn_client_data',
          'signature_payload'
        ];
        
        // Check if WebAuthn parameters exist (even if empty - their presence indicates WebAuthn is required)
        // OR if the contract has requires_webauthn flag set
        const hasWebAuthnParams = webauthnParamNames.some(paramName => 
          functionParams.hasOwnProperty(paramName)
        );
        
        const requiresWebAuthn = rule.requires_webauthn || hasWebAuthnParams;
        
        if (requiresWebAuthn) {
          console.log(`[BackgroundAI] ⚠️  Rule ${rule.id} (${rule.rule_name}) requires WebAuthn authentication - Skipping automatic execution`);
          console.log(`[BackgroundAI] ℹ️  This rule matched the location but requires manual execution via browser UI`);
          
          // Store the matched public key so it can be used as destination in pending rules
          // Mark as matched but not executed (requires manual execution)
          executionResults.push({
            rule_id: rule.id,
            success: false,
            skipped: true,
            reason: 'requires_webauthn',
            message: 'Rule matched but requires WebAuthn/passkey authentication. Please execute manually via browser UI.',
            matched_public_key: public_key // Store the public key that matched the rule
          });
          matchedRuleIds.push(rule.id); // Still count as matched
          continue; // Skip to next rule
        }
        
        try {
          console.log(`[BackgroundAI] ⚡ Executing rule ${rule.id} (${rule.rule_name})...`);
          
          // Build parameters from rule configuration
          const functionMappings = typeof rule.function_mappings === 'string'
            ? JSON.parse(rule.function_mappings)
            : rule.function_mappings;
          
          const mapping = functionMappings?.[rule.function_name];
          
          // Map location data to function parameters if mapping exists
          const parameters = { ...functionParams };
          if (mapping?.parameters) {
            for (const param of mapping.parameters) {
              if (param.mapped_from === 'latitude') {
                parameters[param.name] = actualLatitude;
              } else if (param.mapped_from === 'longitude') {
                parameters[param.name] = actualLongitude;
              } else if (param.mapped_from === 'user_public_key') {
                parameters[param.name] = public_key;
              }
            }
          }
          
          // Execute the contract function
          const result = await this.executeContractRuleDirectly(rule, parameters, public_key);
          executionResults.push({
            rule_id: rule.id,
            success: true,
            result: result
          });
          matchedRuleIds.push(rule.id);
          
          console.log(`[BackgroundAI] ✅ Rule ${rule.id} executed successfully (took ${Date.now() - executionStartTime}ms)`);
        } catch (error) {
          console.error(`[BackgroundAI] ❌ Error executing rule ${rule.id}:`, {
            error: error.message,
            stack: error.stack,
            took: `${Date.now() - executionStartTime}ms`
          });
          executionResults.push({
            rule_id: rule.id,
            success: false,
            error: error.message
          });
          matchedRuleIds.push(rule.id); // Still count as matched even if execution failed
        }
      }

      // Complete processing
      // Pass matchedRuleIds as a PostgreSQL array (not JSON string)
      // pg library will automatically convert JavaScript array to PostgreSQL array format
      await pool.query(
        'SELECT complete_location_update_processing($1, $2, $3, $4)',
        [
          update_id,
          executionResults.some(r => r.success) ? 'executed' : 'matched',
          matchedRuleIds.length > 0 ? matchedRuleIds : null, // Pass array directly, or null if empty
          JSON.stringify(executionResults)
        ]
      );

      const totalTime = Date.now() - processStartTime;
      console.log(`[BackgroundAI] ✅ Processed location update ${update_id}:`, {
        rules_analyzed: rules.length,
        rules_executed: executionResults.length,
        rules_successful: executionResults.filter(r => r.success).length,
        execution_results: executionResults.map(r => ({
          rule_id: r.rule_id,
          success: r.success
        })),
        total_time: `${totalTime}ms`
      });
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error processing location update ${update_id}:`, {
        error: error.message,
        stack: error.stack,
        took: `${Date.now() - processStartTime}ms`
      });
      await pool.query(
        'SELECT complete_location_update_processing($1, $2)',
        [update_id, 'failed']
      );
    }
  }

  /**
   * Get or create an AI session for a user
   */
  async getOrCreateAISession(userId, sessionType = 'location_processing') {
    try {
      // Try to get existing active session
      const existing = await pool.query(
        `SELECT * FROM background_ai_sessions 
         WHERE user_id = $1 AND session_type = $2 AND is_active = true AND is_paused = false
         ORDER BY last_activity_at DESC LIMIT 1`,
        [userId, sessionType]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      // Create new session
      const systemPrompt = this.getSystemPromptForSessionType(sessionType);
      
      const newSession = await pool.query(
        `INSERT INTO background_ai_sessions 
         (user_id, session_name, session_type, system_prompt, conversation_history, context_data)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          userId,
          `${sessionType}_${Date.now()}`,
          sessionType,
          systemPrompt,
          JSON.stringify([]),
          JSON.stringify({})
        ]
      );

      return newSession.rows[0];
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error getting/creating AI session:', error);
      throw error;
    }
  }

  /**
   * Get system prompt for session type
   */
  getSystemPromptForSessionType(sessionType) {
    const prompts = {
      location_processing: `You are a GeoLink Background AI Agent that analyzes location updates and matches them with contract execution rules.

Your role:
1. Analyze incoming location updates (latitude, longitude, wallet public key)
2. Evaluate which contract execution rules should be triggered
3. Consider rule conditions: location proximity, geofences, trigger types (enter/exit/within)
4. Determine if contract functions should execute based on rule configuration
5. Provide confidence scores and reasoning for each match

Rules can be:
- Location-based: circular area with center point and radius
- Geofence-based: polygon area
- Proximity-based: distance-based triggers

Return JSON with:
- rule_id: ID of the rule
- should_execute: boolean (should this rule trigger execution?)
- confidence_score: 0.0 to 1.0
- reasoning: explanation of your decision
- suggested_parameters: AI-suggested function parameters (if applicable)`,

      rule_matching: `You are a GeoLink Rule Matching AI that intelligently matches location updates with contract execution rules.`,

      contract_execution: `You are a GeoLink Contract Execution AI that determines optimal parameters for contract function calls.`
    };

    return prompts[sessionType] || prompts.location_processing;
  }

  /**
   * Get active rules that might match this location
   */
  async getActiveRulesForLocation(userId, latitude, longitude, publicKey) {
    try {
      // Get rules that are:
      // 1. Active
      // 2. Belong to this user
      // 3. Either target this specific wallet OR target any wallet (target_wallet_public_key IS NULL)
      // 4. Location is within rule area (for location/proximity) OR geofence contains location
      
      const result = await pool.query(
        `SELECT cer.*, cc.contract_address, cc.network, cc.function_mappings, cc.requires_webauthn
         FROM contract_execution_rules cer
         JOIN custom_contracts cc ON cer.contract_id = cc.id
         WHERE cer.user_id = $1
           AND cer.is_active = true
           AND cc.is_active = true
           AND (
             cer.target_wallet_public_key IS NULL 
             OR cer.target_wallet_public_key = $4
           )
           AND (
             -- Location-based rules: check if point is within radius
             (cer.rule_type = 'location' AND 
              ST_DWithin(
                ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
                ST_SetSRID(ST_MakePoint(cer.center_longitude, cer.center_latitude), 4326)::geography,
                cer.radius_meters
              ))
             OR
             -- Geofence-based rules: check if point is within geofence boundary
             (cer.rule_type = 'geofence' AND cer.geofence_id IS NOT NULL AND
              EXISTS (
                SELECT 1 FROM geofences g
                WHERE g.id = cer.geofence_id
                  AND ST_Within(
                    ST_SetSRID(ST_MakePoint($3, $2), 4326),
                    g.boundary
                  )
              ))
             OR
             -- Proximity-based rules: check if point is within proximity radius
             (cer.rule_type = 'proximity' AND 
              ST_DWithin(
                ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
                ST_SetSRID(ST_MakePoint(cer.center_longitude, cer.center_latitude), 4326)::geography,
                cer.radius_meters
              ))
           )
         ORDER BY cer.created_at ASC`,
        [userId, latitude, longitude, publicKey]
      );

      return result.rows;
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error getting active rules:', error);
      return [];
    }
  }

  /**
   * Use AI to analyze which rules should be triggered
   */
  async analyzeRulesWithAI(aiSession, locationUpdate, rules) {
    const analysisStartTime = Date.now();
    try {
      console.log(`[BackgroundAI] 🤖 AI Analysis starting:`, {
        session_id: aiSession.id,
        update_id: locationUpdate.update_id,
        rules_count: rules.length,
        public_key: locationUpdate.public_key?.substring(0, 8) + '...'
      });
      // Get latest location from wallet_locations (more accurate than queue data)
      const latestLocation = await pool.query(
        `SELECT * FROM get_latest_wallet_location($1, $2)`,
        [locationUpdate.public_key, 'Stellar']
      );
      
      const actualLatitude = latestLocation.rows[0]?.latitude || locationUpdate.latitude;
      const actualLongitude = latestLocation.rows[0]?.longitude || locationUpdate.longitude;
      
      // Build context for AI using latest location
      const context = {
        location_update: {
          public_key: locationUpdate.public_key,
          latitude: actualLatitude,
          longitude: actualLongitude,
          received_at: locationUpdate.received_at,
          is_latest: !!latestLocation.rows[0] // Flag to indicate if we used latest location
        },
        rules: rules.map(rule => ({
          id: rule.id,
          name: rule.rule_name,
          type: rule.rule_type,
          function_name: rule.function_name,
          trigger_on: rule.trigger_on,
          auto_execute: rule.auto_execute,
          requires_confirmation: rule.requires_confirmation,
          center_latitude: rule.center_latitude,
          center_longitude: rule.center_longitude,
          radius_meters: rule.radius_meters
        }))
      };

      // Build AI prompt
      const userMessage = {
        role: 'user',
        content: `Analyze this location update and determine which contract execution rules should be triggered:

Location Update:
- Wallet: ${locationUpdate.public_key}
- Coordinates: (${actualLatitude}, ${actualLongitude}) ${latestLocation.rows[0] ? '(Latest from wallet_locations)' : '(From queue)'}
- Received: ${locationUpdate.received_at}

Active Rules to Evaluate:
${rules.map((r, i) => `${i + 1}. ${r.rule_name} (ID: ${r.id})
   - Type: ${r.rule_type}
   - Function: ${r.function_name}
   - Trigger: ${r.trigger_on}
   - Auto-execute: ${r.auto_execute}
   - Requires confirmation: ${r.requires_confirmation}
   ${r.rule_type === 'location' || r.rule_type === 'proximity' ? `- Center: (${r.center_latitude}, ${r.center_longitude}), Radius: ${r.radius_meters}m` : ''}
`).join('\n')}

For each rule, determine:
1. Should this rule execute? (consider trigger_on: enter/exit/within)
2. Confidence score (0.0 to 1.0)
3. Reasoning
4. Suggested function parameters (if applicable)

Return JSON array with one object per rule:
[
  {
    "rule_id": 1,
    "should_execute": true,
    "confidence_score": 0.95,
    "reasoning": "Wallet entered the location area...",
    "suggested_parameters": {"latitude": 40.7128, "longitude": -74.0060}
  },
  ...
]`
      };

      // Get conversation history
      const conversationHistory = Array.isArray(aiSession.conversation_history) 
        ? aiSession.conversation_history 
        : JSON.parse(aiSession.conversation_history || '[]');

      // Add system message if not present
      if (conversationHistory.length === 0 || conversationHistory[0].role !== 'system') {
        conversationHistory.unshift({
          role: 'system',
          content: aiSession.system_prompt || this.getSystemPromptForSessionType(aiSession.session_type)
        });
      }

      // Add user message
      conversationHistory.push(userMessage);

      // Call Azure OpenAI
      const openAIStartTime = Date.now();
      console.log(`[BackgroundAI] 🤖 Calling Azure OpenAI with ${conversationHistory.length} message(s)...`);
      const response = await azureOpenAIService.chatCompletion({
        messages: conversationHistory,
        temperature: aiSession.temperature || 0.7,
        max_tokens: aiSession.max_tokens || 2000
      });
      console.log(`[BackgroundAI] 🤖 Azure OpenAI response received (took ${Date.now() - openAIStartTime}ms):`, {
        model: response.model,
        usage: response.usage,
        response_length: response.choices[0].message.content.length
      });

      // Parse AI response
      const aiResponse = response.choices[0].message.content;
      console.log(`[BackgroundAI] 🤖 AI Response (first 500 chars):`, aiResponse.substring(0, 500));
      let aiMatches = [];

      try {
        // Try to extract JSON from response
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          aiMatches = JSON.parse(jsonMatch[0]);
        } else {
          // Try parsing entire response as JSON
          aiMatches = JSON.parse(aiResponse);
        }
      } catch (parseError) {
        console.error('[BackgroundAI] ⚠️  Could not parse AI response as JSON:', parseError);
        console.log('[BackgroundAI] AI Response:', aiResponse);
        // Fallback: create matches for all rules with low confidence
        aiMatches = rules.map(rule => ({
          rule_id: rule.id,
          should_execute: false,
          confidence_score: 0.3,
          reasoning: 'AI response could not be parsed, defaulting to no execution',
          suggested_parameters: {}
        }));
      }

      // Save AI matches to database
      console.log(`[BackgroundAI] 💾 Saving ${aiMatches.length} AI match(es) to database...`);
      const matchRecords = [];
      for (const match of aiMatches) {
        const matchRecord = await pool.query(
          `INSERT INTO ai_rule_matches 
           (location_update_id, rule_id, ai_session_id, confidence_score, reasoning, 
            suggested_parameters, should_execute, execution_priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            locationUpdate.update_id,
            match.rule_id,
            aiSession.id,
            match.confidence_score || 0.5,
            match.reasoning || 'No reasoning provided',
            JSON.stringify(match.suggested_parameters || {}),
            match.should_execute || false,
            Math.round((match.confidence_score || 0) * 100) // Priority based on confidence
          ]
        );
        matchRecords.push({
          ...match,
          match_id: matchRecord.rows[0].id
        });
        console.log(`[BackgroundAI] 💾 Saved match for rule ${match.rule_id}:`, {
          match_id: matchRecord.rows[0].id,
          should_execute: match.should_execute,
          confidence: match.confidence_score
        });
      }

      // Update AI session conversation history
      conversationHistory.push({
        role: 'assistant',
        content: aiResponse
      });

      await pool.query(
        `UPDATE background_ai_sessions 
         SET conversation_history = $1, 
             last_activity_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(conversationHistory), aiSession.id]
      );

      // Log activity
      await pool.query(
        `INSERT INTO ai_session_activity_logs 
         (session_id, activity_type, activity_data, message)
         VALUES ($1, $2, $3, $4)`,
        [
          aiSession.id,
          'rule_analyzed',
          JSON.stringify({ location_update_id: locationUpdate.update_id, rules_analyzed: rules.length }),
          `Analyzed ${rules.length} rule(s) for location update`
        ]
      );

      const totalAnalysisTime = Date.now() - analysisStartTime;
      console.log(`[BackgroundAI] ✅ AI Analysis complete (took ${totalAnalysisTime}ms):`, {
        matches_created: matchRecords.length,
        should_execute_count: matchRecords.filter(m => m.should_execute).length
      });

      return matchRecords;
    } catch (error) {
      const totalAnalysisTime = Date.now() - analysisStartTime;
      console.error('[BackgroundAI] ❌ Error analyzing rules with AI:', {
        error: error.message,
        stack: error.stack,
        took: `${totalAnalysisTime}ms`
      });
      throw error;
    }
  }

  /**
   * Execute a contract rule directly (without AI analysis)
   */
  async executeContractRuleDirectly(rule, parameters, publicKey) {
    try {
      // For now, just log the execution
      // TODO: Actually call the contract execution endpoint or service
      // This would involve calling the /api/contracts/:id/execute endpoint
      // or directly using the Stellar SDK to invoke the contract
      
      return {
        rule_id: rule.id,
        function_name: rule.function_name,
        parameters: parameters,
        public_key: publicKey,
        status: 'pending_execution',
        note: 'Contract execution will be implemented in next phase. Rule matched and queued for execution.'
      };
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error executing contract rule ${rule.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute a contract rule (legacy - used by AI analysis, kept for backward compatibility)
   */
  async executeContractRule(match) {
    try {
      // Get rule details
      const ruleResult = await pool.query(
        `SELECT cer.*, cc.contract_address, cc.network, cc.function_mappings
         FROM contract_execution_rules cer
         JOIN custom_contracts cc ON cer.contract_id = cc.id
         WHERE cer.id = $1`,
        [match.rule_id]
      );

      if (ruleResult.rows.length === 0) {
        throw new Error('Rule not found');
      }

      const rule = ruleResult.rows[0];
      const functionMappings = typeof rule.function_mappings === 'string'
        ? JSON.parse(rule.function_mappings)
        : rule.function_mappings;

      // Get function mapping
      const mapping = functionMappings[rule.function_name];
      if (!mapping) {
        throw new Error(`Function mapping not found for: ${rule.function_name}`);
      }

      // Build parameters using mapping and AI suggestions
      const parameters = {};
      if (mapping.parameters) {
        for (const param of mapping.parameters) {
          if (param.mapped_from === 'latitude') {
            parameters[param.name] = match.suggested_parameters?.latitude || match.location_update?.latitude;
          } else if (param.mapped_from === 'longitude') {
            parameters[param.name] = match.suggested_parameters?.longitude || match.location_update?.longitude;
          } else if (param.mapped_from === 'user_public_key') {
            parameters[param.name] = match.location_update?.public_key;
          } else if (match.suggested_parameters?.[param.name]) {
            parameters[param.name] = match.suggested_parameters[param.name];
          } else if (rule.function_parameters?.[param.name]) {
            parameters[param.name] = rule.function_parameters[param.name];
          }
        }
      }

      // TODO: Actually execute the contract function
      // This would call the contract execution endpoint or service
      // For now, return a placeholder result
      return {
        rule_id: rule.id,
        function_name: rule.function_name,
        parameters: parameters,
        status: 'pending_execution',
        note: 'Contract execution will be implemented in next phase'
      };
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error executing contract rule ${match.rule_id}:`, error);
      throw error;
    }
  }
}

// Singleton instance
const backgroundAIService = new BackgroundAIService();

module.exports = backgroundAIService;

