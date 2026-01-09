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
    try {
      this.isProcessing = true;

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
        return; // No pending updates
      }

      console.log(`[BackgroundAI] 📍 Processing ${result.rows.length} location update(s) (latest per public_key)`);

      for (const update of result.rows) {
        await this.processLocationUpdate(update);
      }
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error processing location update queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single location update
   */
  async processLocationUpdate(update) {
    const { update_id, user_id, public_key, latitude, longitude } = update;

    try {
      // Mark as processing
      await pool.query('SELECT mark_location_update_processing($1)', [update_id]);

      // Get active AI session for this user (or create default)
      const aiSession = await this.getOrCreateAISession(user_id, 'location_processing');

      // IMPORTANT: Always use the latest location from wallet_locations table
      // Location updates come every 5 seconds, so we need the most recent data
      const latestLocation = await pool.query(
        `SELECT * FROM get_latest_wallet_location($1, $2)`,
        [public_key, 'Stellar'] // Default to Stellar, could be made dynamic
      );
      
      // Use latest location if available, otherwise use queue data
      const actualLatitude = latestLocation.rows[0]?.latitude || latitude;
      const actualLongitude = latestLocation.rows[0]?.longitude || longitude;
      
      console.log(`[BackgroundAI] 📍 Using latest location for ${public_key}: (${actualLatitude}, ${actualLongitude})`);
      
      // Get all active contract execution rules for this user using latest location
      const rules = await this.getActiveRulesForLocation(user_id, actualLatitude, actualLongitude, public_key);

      if (rules.length === 0) {
        console.log(`[BackgroundAI] ℹ️  No active rules found for location update ${update_id}`);
        await pool.query(
          'SELECT complete_location_update_processing($1, $2)',
          [update_id, 'skipped']
        );
        return;
      }

      // Use AI to analyze which rules should be triggered
      const aiMatches = await this.analyzeRulesWithAI(aiSession, update, rules);

      // Filter to rules that should execute
      const rulesToExecute = aiMatches.filter(m => m.should_execute);

      if (rulesToExecute.length === 0) {
        console.log(`[BackgroundAI] ℹ️  AI determined no rules should execute for update ${update_id}`);
        await pool.query(
          'SELECT complete_location_update_processing($1, $2, $3)',
          [update_id, 'matched', JSON.stringify(aiMatches.map(m => m.rule_id))]
        );
        return;
      }

      // Execute contract functions for matched rules
      const executionResults = [];
      for (const match of rulesToExecute) {
        try {
          const result = await this.executeContractRule(match);
          executionResults.push({
            rule_id: match.rule_id,
            success: true,
            result: result
          });

          // Update AI match record
          await pool.query(
            `UPDATE ai_rule_matches 
             SET executed = true, execution_result = $1, executed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [JSON.stringify(result), match.match_id]
          );
        } catch (error) {
          console.error(`[BackgroundAI] ❌ Error executing rule ${match.rule_id}:`, error);
          executionResults.push({
            rule_id: match.rule_id,
            success: false,
            error: error.message
          });

          // Update AI match record with error
          await pool.query(
            `UPDATE ai_rule_matches 
             SET executed = true, execution_error = $1, executed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [error.message, match.match_id]
          );
        }
      }

      // Complete processing
      await pool.query(
        'SELECT complete_location_update_processing($1, $2, $3, $4)',
        [
          update_id,
          'executed',
          JSON.stringify(aiMatches.map(m => m.rule_id)),
          JSON.stringify(executionResults)
        ]
      );

      console.log(`[BackgroundAI] ✅ Processed location update ${update_id}: ${rulesToExecute.length} rule(s) executed`);
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error processing location update ${update_id}:`, error);
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
        `SELECT cer.*, cc.contract_address, cc.network, cc.function_mappings
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
             -- Geofence-based rules: check if point is within geofence polygon
             (cer.rule_type = 'geofence' AND cer.geofence_id IS NOT NULL AND
              EXISTS (
                SELECT 1 FROM geofences g
                WHERE g.id = cer.geofence_id
                  AND ST_Within(
                    ST_SetSRID(ST_MakePoint($3, $2), 4326),
                    g.polygon
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
         ORDER BY cer.execution_priority DESC, cer.created_at ASC`,
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
    try {
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
      const response = await azureOpenAIService.chatCompletion({
        messages: conversationHistory,
        temperature: aiSession.temperature || 0.7,
        max_tokens: aiSession.max_tokens || 2000
      });

      // Parse AI response
      const aiResponse = response.choices[0].message.content;
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

      return matchRecords;
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error analyzing rules with AI:', error);
      throw error;
    }
  }

  /**
   * Execute a contract rule
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

