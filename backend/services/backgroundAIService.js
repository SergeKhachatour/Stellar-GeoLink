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
const { logEvent, fuzzLocation } = require('../utils/eventLogger');

// Optional: Balance check service (may not be available in all deployments)
let balanceCheckService = null;
try {
  balanceCheckService = require('./balanceCheckService');
} catch (error) {
  console.warn('[BackgroundAI] ⚠️ balanceCheckService not available:', error.message);
}

class BackgroundAIService {
  constructor() {
    this.processingInterval = null;
    this.cleanupInterval = null;
    this.isProcessing = false;
  }

  /**
   * Start the background processing worker
   * Processes location updates from the queue
   */
  start(intervalMs = 5000) {
    if (this.processingInterval) {
      // console.log('[BackgroundAI] ⚠️  Worker already running');
      return;
    }

    // console.log(`[BackgroundAI] 🚀 Starting background AI worker (interval: ${intervalMs}ms)`);
    
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processLocationUpdateQueue();
      }
    }, intervalMs);

    // Start periodic queue cleanup (every 1 hour)
    // Only runs cleanup if there are actually old entries to clean up
    // This reduces unnecessary database load
    this.cleanupInterval = setInterval(async () => {
      // Check if there are old entries before running cleanup
      const hasOldEntries = await this.checkForOldEntries();
      if (hasOldEntries) {
        await this.runPeriodicCleanup();
      }
    }, 60 * 60 * 1000); // 1 hour instead of 10 minutes
  }

  /**
   * Stop the background processing worker
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      // console.log('[BackgroundAI] ⏹️  Background AI worker stopped');
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Re-evaluate expired rate limits
   * Updates execution_results for rules that were rate_limit_exceeded but the window has now expired
   */
  async reEvaluateExpiredRateLimits() {
    try {
      console.log('[BackgroundAI] 🔄 Re-evaluating expired rate limits...');
      
      // Find all rules with rate_limit_exceeded reason that might have expired
      const expiredRateLimitQuery = `
        SELECT 
          luq.id as update_id,
          luq.public_key,
          luq.user_id,
          luq.execution_results,
          (result->>'rule_id')::integer as rule_id,
          result->>'matched_public_key' as matched_public_key,
          result->>'reason' as reason
        FROM location_update_queue luq
        CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) AS result
        JOIN contract_execution_rules cer ON cer.id = (result->>'rule_id')::integer
        JOIN custom_contracts cc ON cer.contract_id = cc.id
        WHERE luq.status IN ('matched', 'executed')
          AND luq.execution_results IS NOT NULL
          AND result->>'skipped' = 'true'
          AND result->>'reason' = 'rate_limit_exceeded'
          AND COALESCE((result->>'completed')::boolean, false) = false
          AND cer.max_executions_per_public_key IS NOT NULL
          AND cer.execution_time_window_seconds IS NOT NULL
          AND cer.max_executions_per_public_key > 0
          AND cer.execution_time_window_seconds > 0
      `;
      
      const expiredResults = await pool.query(expiredRateLimitQuery);
      console.log(`[BackgroundAI] 🔍 Found ${expiredResults.rows.length} rule(s) with rate_limit_exceeded reason`);
      
      let reEvaluatedCount = 0;
      let updatedToWebAuthnCount = 0;
      let stillBlockedCount = 0;
      
      for (const row of expiredResults.rows) {
        const ruleId = row.rule_id;
        const publicKey = row.matched_public_key || row.public_key;
        
        // Get rule details
        const ruleQuery = await pool.query(
          `SELECT 
            cer.max_executions_per_public_key,
            cer.execution_time_window_seconds,
            cc.requires_webauthn
           FROM contract_execution_rules cer
           JOIN custom_contracts cc ON cer.contract_id = cc.id
           WHERE cer.id = $1`,
          [ruleId]
        );
        
        if (ruleQuery.rows.length === 0) continue;
        
        const rule = ruleQuery.rows[0];
        const maxExecutions = rule.max_executions_per_public_key;
        const timeWindow = rule.execution_time_window_seconds;
        const requiresWebAuthn = rule.requires_webauthn === true || rule.requires_webauthn === 'true' || rule.requires_webauthn === 1;
        
        // Check current rate limit status
        const rateLimitCheck = await pool.query(
          `SELECT COUNT(*) as count
           FROM rule_execution_history
           WHERE rule_id = $1 AND public_key = $2
             AND last_execution_at >= CURRENT_TIMESTAMP - ($3 || ' seconds')::INTERVAL`,
          [ruleId, publicKey, timeWindow]
        );
        
        const currentCount = parseInt(rateLimitCheck.rows[0].count);
        const isStillBlocked = currentCount >= maxExecutions;
        
        if (!isStillBlocked) {
          // Rate limit window has expired, re-evaluate
          console.log(`[BackgroundAI] ✅ Rate limit expired for Rule ${ruleId} (public_key: ${publicKey.substring(0, 12)}...): ${currentCount}/${maxExecutions} in ${timeWindow}s window`);
          
          // Update execution_results
          let executionResults = typeof row.execution_results === 'string' 
            ? JSON.parse(row.execution_results) 
            : row.execution_results;
          
          const updatedResults = executionResults.map(result => {
            if (result.rule_id === ruleId && 
                result.reason === 'rate_limit_exceeded' &&
                (result.matched_public_key || row.public_key) === publicKey) {
              
              // If rule requires WebAuthn, change reason to requires_webauthn
              // Otherwise, mark as ready (but still skipped since it requires WebAuthn or other checks)
              const newReason = requiresWebAuthn ? 'requires_webauthn' : result.reason;
              
              console.log(`[BackgroundAI] 🔄 Updating Rule ${ruleId} reason from 'rate_limit_exceeded' to '${newReason}'`);
              
              return {
                ...result,
                reason: newReason,
                rate_limit_expired: true,
                rate_limit_re_evaluated_at: new Date().toISOString(),
                previous_reason: 'rate_limit_exceeded'
              };
            }
            return result;
          });
          
          // Update the database
          await pool.query(
            `UPDATE location_update_queue 
             SET execution_results = $1::jsonb
             WHERE id = $2`,
            [JSON.stringify(updatedResults), row.update_id]
          );
          
          reEvaluatedCount++;
          if (requiresWebAuthn) {
            updatedToWebAuthnCount++;
          }
        } else {
          // Still blocked by rate limit
          console.log(`[BackgroundAI] ⚠️ Rule ${ruleId} still rate-limited: ${currentCount}/${maxExecutions} in ${timeWindow}s window`);
          stillBlockedCount++;
        }
      }
      
      if (reEvaluatedCount > 0) {
        console.log(`[BackgroundAI] ✅ Re-evaluated ${reEvaluatedCount} expired rate limit(s): ${updatedToWebAuthnCount} updated to requires_webauthn, ${stillBlockedCount} still blocked`);
      }
      
      return {
        reEvaluated: reEvaluatedCount,
        updatedToWebAuthn: updatedToWebAuthnCount,
        stillBlocked: stillBlockedCount
      };
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error re-evaluating expired rate limits:', error.message);
      throw error;
    }
  }

  /**
   * Clean up very old pending rules (older than 7 days)
   * These are entries that have been pending for too long and should be removed
   */
  async cleanupVeryOldPendingRules() {
    try {
      console.log('[BackgroundAI] 🧹 Cleaning up very old pending rules (older than 7 days)...');
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Mark very old pending rules as superseded
      const markOldSupersededQuery = `
        UPDATE location_update_queue luq
        SET execution_results = (
          SELECT jsonb_agg(
            CASE 
              WHEN COALESCE((result->>'completed')::boolean, false) = false
                AND COALESCE((result->>'skipped')::boolean, false) = true
                AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
                AND luq.received_at < $1::timestamp
              THEN result || jsonb_build_object(
                'reason', 'superseded_by_newer_execution',
                'superseded_at', CURRENT_TIMESTAMP::text,
                'superseded_reason', 'very_old_entry'
              )
              ELSE result
            END
          )
          FROM jsonb_array_elements(luq.execution_results) AS result
        )
        WHERE luq.status IN ('matched', 'executed')
          AND luq.execution_results IS NOT NULL
          AND luq.received_at < $1::timestamp
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(luq.execution_results) AS result
            WHERE COALESCE((result->>'completed')::boolean, false) = false
              AND COALESCE((result->>'skipped')::boolean, false) = true
              AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
          )
      `;
      
      const markResult = await pool.query(markOldSupersededQuery, [sevenDaysAgo]);
      
      // Also delete very old entries that have no valid pending rules
      const deleteOldQuery = `
        DELETE FROM location_update_queue luq
        WHERE luq.status IN ('matched', 'executed')
          AND luq.execution_results IS NOT NULL
          AND luq.received_at < $1::timestamp
          -- Only delete if all execution results are skipped/superseded (no valid pending rules)
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(luq.execution_results) AS result
            WHERE COALESCE((result->>'completed')::boolean, false) = false
              AND COALESCE((result->>'skipped')::boolean, false) = true
              AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rate_limit_exceeded', 'rejected')
          )
          -- Don't delete entries that have completed rules
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(luq.execution_results) AS result
            WHERE COALESCE((result->>'completed')::boolean, false) = true
          )
      `;
      
      const deleteResult = await pool.query(deleteOldQuery, [sevenDaysAgo]);
      
      if (markResult.rowCount > 0 || deleteResult.rowCount > 0) {
        console.log(`[BackgroundAI] ✅ Cleaned up very old pending rules: ${markResult.rowCount} marked as superseded, ${deleteResult.rowCount} deleted`);
      }
      
      return {
        markedSuperseded: markResult.rowCount,
        deleted: deleteResult.rowCount
      };
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error cleaning up very old pending rules:', error.message);
      throw error;
    }
  }

  /**
   * Check if there are old entries that need cleanup
   * Returns true if there are entries older than 7 days or rate-limited entries that might have expired
   */
  async checkForOldEntries() {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Check for very old entries
      const oldEntriesCheck = await pool.query(
        `SELECT COUNT(*) as count
         FROM location_update_queue luq
         WHERE luq.status IN ('matched', 'executed')
           AND luq.execution_results IS NOT NULL
           AND luq.received_at < $1::timestamp
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(luq.execution_results) AS result
             WHERE COALESCE((result->>'completed')::boolean, false) = false
               AND COALESCE((result->>'skipped')::boolean, false) = true
               AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rejected')
           )`,
        [sevenDaysAgo]
      );
      
      const oldCount = parseInt(oldEntriesCheck.rows[0].count);
      
      // Check for expired rate limits
      const expiredRateLimitCheck = await pool.query(
        `SELECT COUNT(*) as count
         FROM location_update_queue luq
         CROSS JOIN LATERAL jsonb_array_elements(luq.execution_results) AS result
         JOIN contract_execution_rules cer ON cer.id = (result->>'rule_id')::integer
         WHERE luq.status IN ('matched', 'executed')
           AND luq.execution_results IS NOT NULL
           AND result->>'skipped' = 'true'
           AND result->>'reason' = 'rate_limit_exceeded'
           AND COALESCE((result->>'completed')::boolean, false) = false
           AND cer.max_executions_per_public_key IS NOT NULL
           AND cer.execution_time_window_seconds IS NOT NULL
           AND cer.max_executions_per_public_key > 0
           AND cer.execution_time_window_seconds > 0`,
        []
      );
      
      const expiredRateLimitCount = parseInt(expiredRateLimitCheck.rows[0].count);
      
      return oldCount > 0 || expiredRateLimitCount > 0;
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error checking for old entries:', error.message);
      // If check fails, run cleanup anyway to be safe
      return true;
    }
  }

  /**
   * Run periodic full cleanup of the queue
   * This is called periodically (every hour) or on-demand when old entries are detected
   */
  async runPeriodicCleanup() {
    try {
      // console.log('[BackgroundAI] 🧹 Running periodic queue cleanup...');
      
      // First, re-evaluate expired rate limits
      await this.reEvaluateExpiredRateLimits();
      
      // Clean up very old pending rules (older than 7 days)
      await this.cleanupVeryOldPendingRules();
      
      // Mark old pending rules as superseded
      const markSupersededQuery = `
        WITH completed_executions AS (
          SELECT DISTINCT
            (result->>'rule_id')::integer as rule_id,
            COALESCE(result->>'matched_public_key', luq.public_key) as matched_key,
            MAX(luq.received_at) as latest_execution_time
          FROM location_update_queue luq
          CROSS JOIN jsonb_array_elements(luq.execution_results) AS result
          WHERE luq.status IN ('matched', 'executed')
            AND luq.execution_results IS NOT NULL
            AND COALESCE((result->>'completed')::boolean, false) = true
          GROUP BY (result->>'rule_id')::integer, 
                   COALESCE(result->>'matched_public_key', luq.public_key)
        )
        UPDATE location_update_queue luq
        SET execution_results = (
          SELECT jsonb_agg(
            CASE 
              WHEN (result->>'rule_id')::integer = ce.rule_id
                AND COALESCE(result->>'matched_public_key', luq.public_key) = ce.matched_key
                AND COALESCE((result->>'completed')::boolean, false) = false
                AND COALESCE((result->>'skipped')::boolean, false) = true
                AND luq.received_at < ce.latest_execution_time
                AND (result->>'reason')::text != 'superseded_by_newer_execution'
              THEN result || jsonb_build_object(
                'reason', 'superseded_by_newer_execution',
                'superseded_at', CURRENT_TIMESTAMP::text
              )
              ELSE result
            END
          )
          FROM jsonb_array_elements(luq.execution_results) AS result
          CROSS JOIN completed_executions ce
          WHERE (result->>'rule_id')::integer = ce.rule_id
            AND COALESCE(result->>'matched_public_key', luq.public_key) = ce.matched_key
            AND luq.received_at < ce.latest_execution_time
        )
        WHERE luq.status IN ('matched', 'executed')
          AND luq.execution_results IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM completed_executions ce
            CROSS JOIN jsonb_array_elements(luq.execution_results) AS result
            WHERE (result->>'rule_id')::integer = ce.rule_id
              AND COALESCE(result->>'matched_public_key', luq.public_key) = ce.matched_key
              AND luq.received_at < ce.latest_execution_time
              AND COALESCE((result->>'completed')::boolean, false) = false
              AND COALESCE((result->>'skipped')::boolean, false) = true
          )
      `;
      
      await pool.query(markSupersededQuery);
      
      // Delete old entries that are fully superseded
      const deleteOldQuery = `
        DELETE FROM location_update_queue luq
        WHERE luq.status IN ('matched', 'executed')
          AND luq.execution_results IS NOT NULL
          -- Only delete if all execution results are skipped/superseded (no valid pending rules)
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(luq.execution_results) AS result
            WHERE COALESCE((result->>'completed')::boolean, false) = false
              AND COALESCE((result->>'skipped')::boolean, false) = true
              AND (result->>'reason')::text NOT IN ('superseded_by_newer_execution', 'rate_limit_exceeded')
          )
          -- Don't delete entries that have completed rules
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(luq.execution_results) AS result
            WHERE COALESCE((result->>'completed')::boolean, false) = true
          )
      `;
      
      const deleteResult = await pool.query(deleteOldQuery);
      // if (deleteResult.rowCount > 0) {
      //   console.log(`[BackgroundAI] 🧹 Periodic cleanup: Deleted ${deleteResult.rowCount} old queue entries`);
      // }
    } catch (error) {
      console.error('[BackgroundAI] ⚠️ Error in periodic cleanup:', error.message);
    }
  }

  /**
   * Process pending location updates from the queue
   */
  async processLocationUpdateQueue() {
    const startTime = Date.now();
    try {
      this.isProcessing = true;
      // console.log(`[BackgroundAI] 🔄 Starting queue processing cycle at ${new Date().toISOString()}`);

      // First, mark superseded updates (older updates for same public_key)
      // Since updates come every 5 seconds, we only want to process the latest
      const supersededResult = await pool.query('SELECT mark_superseded_location_updates()');
      const supersededCount = supersededResult.rows[0]?.mark_superseded_location_updates || 0;
      // if (supersededCount > 0) {
      //   console.log(`[BackgroundAI] ⏭️  Marked ${supersededCount} superseded location update(s) as skipped`);
      // }

      // Get pending location updates (only latest per public_key)
      const result = await pool.query(
        `SELECT * FROM process_location_update_queue()`
      );

      if (result.rows.length === 0) {
        // console.log(`[BackgroundAI] ✅ Queue processing complete - No pending updates (took ${Date.now() - startTime}ms)`);
        return; // No pending updates
      }

      // console.log(`[BackgroundAI] 📍 Processing ${result.rows.length} location update(s) (latest per public_key)`);
      // console.log(`[BackgroundAI] 📋 Update details:`, result.rows.map(u => ({
      //   update_id: u.update_id,
      //   public_key: u.public_key?.substring(0, 8) + '...',
      //   location: `(${u.latitude}, ${u.longitude})`,
      //   user_id: u.user_id
      // })));

      for (const update of result.rows) {
        const updateStartTime = Date.now();
        // console.log(`[BackgroundAI] 🔍 Processing update ${update.update_id} for public_key ${update.public_key?.substring(0, 8)}...`);
        await this.processLocationUpdate(update);
        // console.log(`[BackgroundAI] ✅ Completed update ${update.update_id} (took ${Date.now() - updateStartTime}ms)`);
      }

      // const totalTime = Date.now() - startTime;
      // console.log(`[BackgroundAI] ✅ Queue processing complete - Processed ${result.rows.length} update(s) in ${totalTime}ms`);
    } catch (error) {
      console.error('[BackgroundAI] ❌ Error processing location update queue:', error);
      // console.error('[BackgroundAI] ❌ Error stack:', error.stack);
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
      // Commented out verbose log - only show summary at the end
      // console.log(`[BackgroundAI] 📍 Processing location update ${update_id} for public_key ${public_key?.substring(0, 8)}... at (${latitude}, ${longitude})`);

      // Mark as processing
      await pool.query('SELECT mark_location_update_processing($1)', [update_id]);
      // console.log(`[BackgroundAI] ✅ Marked update ${update_id} as processing`);

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
      
      // console.log(`[BackgroundAI] 📍 Location data:`, {
      //   queue_location: `(${latitude}, ${longitude})`,
      //   latest_location: latestLocation.rows[0] ? `(${latestLocation.rows[0].latitude}, ${latestLocation.rows[0].longitude})` : 'N/A',
      //   using: isUsingLatest ? 'latest from wallet_locations' : 'queue data',
      //   final_location: `(${actualLatitude}, ${actualLongitude})`,
      //   fetch_took: `${Date.now() - locationFetchStartTime}ms`
      // });
      
      // Get all active contract execution rules that match this location (from ANY user)
      // Rules are already filtered by location/proximity in the query
      // NOTE: We match rules from ALL users, not just the user who sent the location update
      const rulesFetchStartTime = Date.now();
      const rules = await this.getActiveRulesForLocation(actualLatitude, actualLongitude, public_key);
      
      // Commented out verbose logs - only show summary at the end
      // if (rules.length > 0) {
      //   console.log(`[BackgroundAI] 🔍 Evaluating ${rules.length} rule(s) for location update ${update_id}:`, rules.map(r => `Rule ${r.id} (${r.rule_name})`).join(', '));
      //   rules.forEach(rule => {
      //     console.log(`[BackgroundAI] 📋 Rule ${rule.id} (${rule.rule_name}) details:`, {
      //       rule_id: rule.id,
      //       rule_name: rule.rule_name,
      //       function_name: rule.function_name,
      //       requires_webauthn: rule.requires_webauthn,
      //       is_active: rule.is_active,
      //       contract_id: rule.contract_id,
      //       target_wallet_public_key: rule.target_wallet_public_key ? rule.target_wallet_public_key.substring(0, 8) + '...' : 'NULL (any wallet)'
      //     });
      //   });
      // } else {
      //   console.log(`[BackgroundAI] ⚠️ No active rules found for location update ${update_id} at (${actualLatitude}, ${actualLongitude}) for public_key ${public_key.substring(0, 8)}...`);
      // }

      if (rules.length === 0) {
        // console.log(`[BackgroundAI] ℹ️  No active rules found for location update ${update_id} - Skipping`);
        
        // Update location tracking for all rules this public key might have been tracking
        // Mark as out of range if they were previously in range
        await pool.query(
          `UPDATE rule_location_tracking 
           SET is_in_range = false, 
               duration_seconds = 0,
               updated_at = CURRENT_TIMESTAMP
           WHERE public_key = $1 AND is_in_range = true`,
          [public_key]
        );
        
        await pool.query(
          'SELECT complete_location_update_processing($1, $2)',
          [update_id, 'skipped']
        );
        return;
      }

      // Direct rule execution without AI analysis
      // Since rules are already filtered by location/proximity, we can execute them directly
      // console.log(`[BackgroundAI] ⚡ Executing ${rules.length} contract rule(s) directly (no AI analysis)...`);
      const executionResults = [];
      const matchedRuleIds = [];
      
      for (const rule of rules) {
        const executionStartTime = Date.now();
        
        // Commented out verbose rule processing logs - only show summary at the end
        // console.log(`[BackgroundAI] 🔄 Processing Rule ${rule.id} (${rule.rule_name}) - function: ${rule.function_name}`);
        // console.log(`[BackgroundAI] ⚙️ Advanced Settings for Rule ${rule.id}:`, {
        //   rule_id: rule.id,
        //   rule_name: rule.rule_name,
        //   auto_execute: rule.auto_execute,
        //   requires_confirmation: rule.requires_confirmation,
        //   requires_webauthn: rule.requires_webauthn,
        //   contract_requires_webauthn: rule.requires_webauthn, // From contract
        //   max_executions_per_public_key: rule.max_executions_per_public_key,
        //   execution_time_window_seconds: rule.execution_time_window_seconds,
        //   min_location_duration_seconds: rule.min_location_duration_seconds,
        //   submit_readonly_to_ledger: rule.submit_readonly_to_ledger,
        //   target_wallet_public_key: rule.target_wallet_public_key ? rule.target_wallet_public_key.substring(0, 12) + '...' : 'NULL (any wallet)',
        //   rule_type: rule.rule_type,
        //   center_latitude: rule.center_latitude,
        //   center_longitude: rule.center_longitude,
        //   radius_meters: rule.radius_meters
        // });
        
        // Check target wallet filtering (advanced setting)
        if (rule.target_wallet_public_key && rule.target_wallet_public_key !== public_key) {
          console.log(`[BackgroundAI] ⚠️ Rule ${rule.id} (${rule.rule_name}) - Target wallet mismatch:`, {
            rule_id: rule.id,
            rule_name: rule.rule_name,
            target_wallet: rule.target_wallet_public_key.substring(0, 12) + '...',
            current_wallet: public_key.substring(0, 12) + '...',
            matches: false
          });
          executionResults.push({
            rule_id: rule.id,
            success: false,
            skipped: true,
            reason: 'target_wallet_mismatch',
            message: `Rule is configured for a different wallet (target: ${rule.target_wallet_public_key.substring(0, 12)}...)`,
            matched_public_key: public_key
          });
          matchedRuleIds.push(rule.id);
          continue;
        } else if (rule.target_wallet_public_key) {
          // console.log(`[BackgroundAI] ✅ Target wallet check passed for rule ${rule.id} (${rule.rule_name}): wallet matches target`);
        }
        
        // Check auto-execute setting (advanced setting)
        if (rule.auto_execute === false) {
          // console.log(`[BackgroundAI] ⚠️ Rule ${rule.id} (${rule.rule_name}) - Auto-execute disabled:`, {
          //   rule_id: rule.id,
          //   rule_name: rule.rule_name,
          //   auto_execute: rule.auto_execute,
          //   requires_manual_execution: true
          // });
          executionResults.push({
            rule_id: rule.id,
            success: false,
            skipped: true,
            reason: 'auto_execute_disabled',
            message: 'Rule has auto-execute disabled. Please execute manually via browser UI.',
            matched_public_key: public_key
          });
          matchedRuleIds.push(rule.id);
          continue;
        } else {
          // console.log(`[BackgroundAI] ✅ Auto-execute check passed for rule ${rule.id} (${rule.rule_name}): auto_execute=${rule.auto_execute}`);
        }
        
        // Check if WebAuthn is required for this rule FIRST
        // WebAuthn requires browser-based user interaction, so we can't execute it automatically
        // IMPORTANT: Check WebAuthn BEFORE requires_confirmation so that rules requiring WebAuthn
        // are marked as 'requires_webauthn' (which deposit endpoints look for) rather than 'requires_confirmation'
        const functionParams = typeof rule.function_parameters === 'string'
          ? JSON.parse(rule.function_parameters)
          : rule.function_parameters || {};
        
        const webauthnParamNames = [
          'webauthn_signature',
          'webauthn_authenticator_data',
          'webauthn_client_data',
          'signature_payload'
        ];
        
        // Check if WebAuthn parameters exist AND have actual values (not just empty strings/null)
        // Empty parameter names in the rule template don't mean WebAuthn is required
        // Only if the contract explicitly requires it OR parameters have actual values
        const hasWebAuthnParams = webauthnParamNames.some(paramName => {
          const paramValue = functionParams[paramName];
          // Parameter exists and has a non-empty value (not empty string, null, or undefined)
          return paramValue !== undefined && 
                 paramValue !== null && 
                 paramValue !== '' &&
                 !paramValue.toString().includes('[Will be system-generated');
        });
        
        // Only require WebAuthn if contract flag is explicitly true OR parameters have actual values
        // If requires_webauthn is false/null and no WebAuthn params have values, execute immediately
        // Handle both boolean true and string 'true' from database
        const contractRequiresWebAuthn = rule.requires_webauthn === true || 
                                         rule.requires_webauthn === 'true' || 
                                         rule.requires_webauthn === 1;
        const requiresWebAuthn = contractRequiresWebAuthn || hasWebAuthnParams;

        // Check requires_confirmation setting (advanced setting)
        // BUT: If WebAuthn is required, mark as requires_webauthn instead (for deposit endpoint compatibility)
        if (rule.requires_confirmation === true && !requiresWebAuthn) {
          console.log(`[BackgroundAI] ⚠️ Rule ${rule.id} (${rule.rule_name}) - Requires confirmation:`, {
            rule_id: rule.id,
            rule_name: rule.rule_name,
            requires_confirmation: rule.requires_confirmation,
            requires_manual_execution: true
          });
          executionResults.push({
            rule_id: rule.id,
            success: false,
            skipped: true,
            reason: 'requires_confirmation',
            message: 'Rule requires user confirmation. Please execute manually via browser UI.',
            matched_public_key: public_key
          });
          matchedRuleIds.push(rule.id);
          continue;
        } else if (rule.requires_confirmation === true && requiresWebAuthn) {
          // console.log(`[BackgroundAI] ⚠️ Rule ${rule.id} (${rule.rule_name}) - Requires confirmation AND WebAuthn. Marking as requires_webauthn for deposit endpoint compatibility.`);
          // Will be handled by the WebAuthn check below
        } else {
          // console.log(`[BackgroundAI] ✅ Confirmation check passed for rule ${rule.id} (${rule.rule_name}): requires_confirmation=${rule.requires_confirmation}`);
        }

        // Commented out verbose WebAuthn check log
        // console.log(`[BackgroundAI] 🔍 WebAuthn check for rule ${rule.id} (${rule.rule_name}):`, {
        //   contract_requires_webauthn: rule.requires_webauthn,
        //   contract_requires_webauthn_type: typeof rule.requires_webauthn,
        //   contract_requires_webauthn_parsed: contractRequiresWebAuthn,
        //   has_webauthn_params: hasWebAuthnParams,
        //   requires_webauthn: requiresWebAuthn,
        //   function_params_keys: Object.keys(functionParams),
        //   function_name: rule.function_name
        // });
        
        // Check advanced settings FIRST (rate limiting, time-based triggers)
        // These checks apply regardless of whether WebAuthn is required
        // This ensures pending rules only show rules that would pass these checks
        
        // Check rate limiting (only if rule has rate limiting configured)
        // Skip check if max_executions_per_public_key or execution_time_window_seconds is NULL
        if (rule.max_executions_per_public_key && rule.execution_time_window_seconds) {
          // Get detailed rate limit information for logging
          const rateLimitDetailsQuery = await pool.query(
            `SELECT COUNT(*) as count, MAX(last_execution_at) as last_execution
             FROM rule_execution_history
             WHERE rule_id = $1 AND public_key = $2
               AND last_execution_at >= CURRENT_TIMESTAMP - ($3 || ' seconds')::INTERVAL`,
            [rule.id, public_key, rule.execution_time_window_seconds]
          );
          const execCount = parseInt(rateLimitDetailsQuery.rows[0]?.count || 0);
          const lastExecution = rateLimitDetailsQuery.rows[0]?.last_execution;
          
          // Commented out verbose rate limit check log
          // console.log(`[BackgroundAI] ⏱️ Rate limit check for rule ${rule.id} (${rule.rule_name}):`, {
          //   rule_id: rule.id,
          //   rule_name: rule.rule_name,
          //   public_key: public_key.substring(0, 8) + '...',
          //   max_executions: rule.max_executions_per_public_key,
          //   time_window_seconds: rule.execution_time_window_seconds,
          //   current_executions_in_window: execCount,
          //   last_execution: lastExecution,
          //   can_execute: execCount < rule.max_executions_per_public_key
          // });
          
          const canExecute = await pool.query(
            'SELECT can_execute_rule($1, $2) as can_execute',
            [rule.id, public_key]
          );
          
          if (!canExecute.rows[0]?.can_execute) {
            // ESSENTIAL: Log when rate limit blocks a rule
            console.log(`[BackgroundAI] ⚠️ Rule ${rule.id} (${rule.rule_name}) - Rate limit exceeded: ${rule.max_executions_per_public_key} per ${rule.execution_time_window_seconds}s (current: ${execCount}, last execution: ${lastExecution || 'never'})`);
            executionResults.push({
              rule_id: rule.id,
              success: false,
              skipped: true,
              reason: 'rate_limit_exceeded',
              message: `Maximum executions per time window reached (${rule.max_executions_per_public_key} per ${rule.execution_time_window_seconds} seconds)`,
              matched_public_key: public_key
            });
            matchedRuleIds.push(rule.id);
            continue;
          } else {
            // Commented out verbose rate limit check log
            // console.log(`[BackgroundAI] ✅ Rate limit check passed for rule ${rule.id} (${rule.rule_name}): ${execCount}/${rule.max_executions_per_public_key} executions in ${rule.execution_time_window_seconds}s window`);
          }
        }
        // else {
        //   console.log(`[BackgroundAI] ✅ No rate limiting configured for rule ${rule.id} (max_executions: ${rule.max_executions_per_public_key ?? 'NULL'}, time_window: ${rule.execution_time_window_seconds ?? 'NULL'})`);
        // }
        
        // Update location tracking FIRST (before duration check)
        // This ensures tracking is always maintained so duration can accumulate properly
        // Location tracking must be updated regardless of whether duration requirement is met
        await pool.query(
          'SELECT update_rule_location_tracking($1, $2, $3, $4, $5)',
          [rule.id, public_key, actualLatitude, actualLongitude, true]
        );
        
        // Check location duration requirement (only if rule has a duration requirement set)
        // Skip check if min_location_duration_seconds is NULL or 0
        if (rule.min_location_duration_seconds && rule.min_location_duration_seconds > 0) {
          // Get detailed location duration information for logging from rule_location_tracking table
          // Query AFTER updating tracking to get the latest data
          const locationDurationQuery = await pool.query(
            `SELECT 
               entered_location_at,
               duration_seconds,
               is_in_range,
               updated_at
             FROM rule_location_tracking
             WHERE rule_id = $1 AND public_key = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [rule.id, public_key]
          );
          
          const durationInfo = locationDurationQuery.rows[0] || {};
          const actualDuration = parseFloat(durationInfo.duration_seconds || 0);
          
          // Commented out verbose location duration check log
          // console.log(`[BackgroundAI] ⏱️ Location duration check for rule ${rule.id} (${rule.rule_name}):`, {
          //   rule_id: rule.id,
          //   rule_name: rule.rule_name,
          //   public_key: public_key.substring(0, 8) + '...',
          //   required_duration_seconds: rule.min_location_duration_seconds,
          //   actual_duration_seconds: actualDuration,
          //   is_in_range: durationInfo.is_in_range || false,
          //   entered_location_at: durationInfo.entered_location_at,
          //   last_updated: durationInfo.updated_at,
          //   meets_requirement: actualDuration >= rule.min_location_duration_seconds
          // });
          
          const hasMinDuration = await pool.query(
            'SELECT has_min_location_duration($1, $2) as has_duration',
            [rule.id, public_key]
          );
          
          if (!hasMinDuration.rows[0]?.has_duration) {
            // ESSENTIAL: Log when location duration requirement blocks a rule
            console.log(`[BackgroundAI] ⚠️ Rule ${rule.id} (${rule.rule_name}) - Location duration not met: requires ${rule.min_location_duration_seconds}s at location (actual: ${actualDuration.toFixed(1)}s, in_range: ${durationInfo.is_in_range || false})`);
            executionResults.push({
              rule_id: rule.id,
              success: false,
              skipped: true,
              reason: 'insufficient_location_duration',
              message: `Public key has not been at location long enough to trigger execution (requires ${rule.min_location_duration_seconds} seconds, actual: ${actualDuration.toFixed(1)}s)`,
              matched_public_key: public_key
            });
            matchedRuleIds.push(rule.id);
            continue;
          } else {
            // Commented out verbose location duration check passed log
            // console.log(`[BackgroundAI] ✅ Location duration check passed for rule ${rule.id} (${rule.rule_name}): ${actualDuration.toFixed(1)}s >= ${rule.min_location_duration_seconds}s`);
          }
        }
        // else {
        //   console.log(`[BackgroundAI] ✅ No minimum location duration requirement for rule ${rule.id} (min_location_duration_seconds: ${rule.min_location_duration_seconds || 'NULL'})`);
        // }
        
        // NOW check WebAuthn requirement (after advanced settings checks pass)
        if (requiresWebAuthn) {
          // Commented out verbose rule matched log - only show summary at the end
          // const eventMessage = `✅ Rule ${rule.id} (${rule.rule_name}) MATCHED - Added to pending rules (passed advanced settings, requires WebAuthn)`;
          // console.log(`[BackgroundAI] ${eventMessage}`);
          const eventMessage = `✅ Rule ${rule.id} (${rule.rule_name}) MATCHED - Added to pending rules (passed advanced settings, requires WebAuthn)`;
          // Also log to database for public events feed
          await logEvent('rule_matched', eventMessage, {
            rule_id: rule.id,
            rule_name: rule.rule_name,
            update_id: update_id,
            latitude: actualLatitude,
            longitude: actualLongitude
          });
          
          // Store the matched public key so it can be used as destination in pending rules
          // Mark as matched but not executed (requires manual execution)
          // Note: Advanced settings (rate limiting, time-based triggers) have already been checked and passed
          executionResults.push({
            rule_id: rule.id,
            success: false,
            skipped: true,
            reason: 'requires_webauthn',
            message: 'Rule matched and passed advanced settings checks, but requires WebAuthn/passkey authentication. Please execute manually via browser UI.',
            matched_public_key: public_key, // Store the public key that matched the rule
            advanced_settings_passed: true // Indicate that rate limiting and time-based checks passed
          });
          matchedRuleIds.push(rule.id); // Still count as matched
          continue; // Skip to next rule
        }
        
        try {
          // console.log(`[BackgroundAI] ⚡ Executing rule ${rule.id} (${rule.rule_name})...`);
          
          // Location tracking already updated above (before WebAuthn check)
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
          
          // Log submit_readonly_to_ledger setting before execution
          if (rule.submit_readonly_to_ledger) {
            console.log(`[BackgroundAI] 📤 Rule ${rule.id} (${rule.rule_name}) - submit_readonly_to_ledger enabled:`, {
              rule_id: rule.id,
              rule_name: rule.rule_name,
              submit_readonly_to_ledger: rule.submit_readonly_to_ledger,
              function_name: rule.function_name,
              will_submit_to_ledger: true
            });
          }
          
          // Execute the contract function
          const result = await this.executeContractRuleDirectly(rule, parameters, public_key);
          
          // Log execution result with all advanced settings context
          console.log(`[BackgroundAI] 📊 Execution result for Rule ${rule.id} (${rule.rule_name}):`, {
            rule_id: rule.id,
            rule_name: rule.rule_name,
            function_name: rule.function_name,
            success: result.success !== false,
            completed: result.completed === true,
            execution_type: result.execution_type || 'direct',
            transaction_hash: result.transaction_hash ? result.transaction_hash.substring(0, 16) + '...' : 'N/A',
            submit_readonly_to_ledger: rule.submit_readonly_to_ledger || false,
            advanced_settings_summary: {
              auto_execute: rule.auto_execute,
              requires_confirmation: rule.requires_confirmation,
              rate_limit: rule.max_executions_per_public_key ? `${rule.max_executions_per_public_key} per ${rule.execution_time_window_seconds}s` : 'unlimited',
              min_duration: rule.min_location_duration_seconds ? `${rule.min_location_duration_seconds}s` : 'none',
              target_wallet: rule.target_wallet_public_key ? 'specific' : 'any'
            }
          });
          
          // Mark as completed if execution was successful
          const executionResult = {
            rule_id: rule.id,
            success: result.success !== false,
            completed: result.completed === true,
            transaction_hash: result.transaction_hash || null,
            completed_at: result.completed_at || new Date().toISOString(),
            execution_type: result.execution_type || 'direct',
            matched_public_key: public_key,
            direct_execution: true, // Flag to indicate this was executed directly, not from pending
            advanced_settings_passed: true // All advanced settings checks passed
          };
          
          // Add error if execution failed
          if (result.error) {
            executionResult.error = result.error;
            executionResult.note = result.note;
          }
          
          executionResults.push(executionResult);
          matchedRuleIds.push(rule.id);
          
          // Record execution in history for rate limiting
          if (executionResult.success && executionResult.completed) {
            await pool.query(
              'SELECT record_rule_execution($1, $2, $3, $4)',
              [
                rule.id,
                public_key,
                executionResult.transaction_hash,
                JSON.stringify(executionResult)
              ]
            );
            // ESSENTIAL: Log when a rule is executed successfully (read-only functions)
            const eventMessage = `✅ Rule ${rule.id} (${rule.rule_name}) EXECUTED - Transaction: ${executionResult.transaction_hash?.substring(0, 16)}...`;
            console.log(`[BackgroundAI] ${eventMessage}`);
            // Also log to database for public events feed
            await logEvent('rule_executed', eventMessage, {
              rule_id: rule.id,
              rule_name: rule.rule_name,
              transaction_hash: executionResult.transaction_hash,
              update_id: update_id,
              latitude: actualLatitude,
              longitude: actualLongitude
            });
          }
          // else {
          //   console.log(`[BackgroundAI] ✅ Rule ${rule.id} executed successfully (took ${Date.now() - executionStartTime}ms)`, {
          //     success: executionResult.success,
          //     completed: executionResult.completed,
          //     transaction_hash: executionResult.transaction_hash?.substring(0, 16) + '...'
          //   });
          // }
        } catch (error) {
          console.error(`[BackgroundAI] ❌ Error executing rule ${rule.id}:`, error.message);
          // console.error(`[BackgroundAI] ❌ Error stack:`, error.stack);
          executionResults.push({
            rule_id: rule.id,
            success: false,
            error: error.message
          });
          matchedRuleIds.push(rule.id); // Still count as matched even if execution failed
        }
      }

      // Check balance thresholds and auto-deactivate rules if needed
      if (executionResults.some(r => r.success && r.completed) && balanceCheckService) {
        try {
          await balanceCheckService.checkAllRules(public_key);
        } catch (balanceError) {
          console.error(`[BackgroundAI] ⚠️ Error checking balance thresholds:`, balanceError);
          // Don't fail the entire process if balance check fails
        }
      }

      // Complete processing
      // Pass matchedRuleIds as a PostgreSQL array (not JSON string)
      // pg library will automatically convert JavaScript array to PostgreSQL array format
      const executionResultsJson = JSON.stringify(executionResults);
      
      // ESSENTIAL: Log comprehensive summary of what was processed
      const pendingCount = executionResults.filter(r => r.reason === 'requires_webauthn').length;
      const executedCount = executionResults.filter(r => r.success && r.completed).length;
      const rateLimitBlocked = executionResults.filter(r => r.reason === 'rate_limit_exceeded').length;
      const durationBlocked = executionResults.filter(r => r.reason === 'insufficient_location_duration').length;
      const targetWalletBlocked = executionResults.filter(r => r.reason === 'target_wallet_mismatch').length;
      const autoExecuteBlocked = executionResults.filter(r => r.reason === 'auto_execute_disabled').length;
      const confirmationBlocked = executionResults.filter(r => r.reason === 'requires_confirmation').length;
      const errorCount = executionResults.filter(r => r.error).length;
      
      console.log(`[BackgroundAI] 📊 Location update ${update_id} processing summary:`, {
        update_id: update_id,
        public_key: public_key.substring(0, 12) + '...',
        location: `(${actualLatitude}, ${actualLongitude})`,
        total_rules_evaluated: rules.length,
        executed: executedCount,
        pending_webauthn: pendingCount,
        blocked_by_rate_limit: rateLimitBlocked,
        blocked_by_duration: durationBlocked,
        blocked_by_target_wallet: targetWalletBlocked,
        blocked_by_auto_execute: autoExecuteBlocked,
        blocked_by_confirmation: confirmationBlocked,
        errors: errorCount,
        execution_results: executionResults.map(r => ({
          rule_id: r.rule_id,
          reason: r.reason,
          success: r.success,
          completed: r.completed
        }))
      });
      
      // console.log(`[BackgroundAI] 💾 Saving execution results for update ${update_id}:`, {
      //   status: executionResults.some(r => r.success) ? 'executed' : 'matched',
      //   matched_rule_ids: matchedRuleIds,
      //   execution_results_count: executionResults.length,
      //   skipped_rules: executionResults.filter(r => r.skipped).length,
      //   requires_webauthn_rules: executionResults.filter(r => r.reason === 'requires_webauthn').length,
      //   execution_results_preview: executionResults.map(r => ({
      //     rule_id: r.rule_id,
      //     skipped: r.skipped,
      //     reason: r.reason,
      //     matched_public_key: r.matched_public_key
      //   }))
      // });
      
      await pool.query(
        'SELECT complete_location_update_processing($1, $2, $3, $4::jsonb)',
        [
          update_id,
          executionResults.some(r => r.success) ? 'executed' : 'matched',
          matchedRuleIds.length > 0 ? matchedRuleIds : null, // Pass array directly, or null if empty
          executionResultsJson
        ]
      );
      
      // Verify the data was saved correctly
      // const verifyResult = await pool.query(
      //   'SELECT id, status, matched_rule_ids, execution_results FROM location_update_queue WHERE id = $1',
      //   [update_id]
      // );
      // if (verifyResult.rows.length > 0) {
      //   const saved = verifyResult.rows[0];
      //   console.log(`[BackgroundAI] ✅ Verified save for update ${update_id}:`, {
      //     status: saved.status,
      //     matched_rule_ids: saved.matched_rule_ids,
      //     execution_results_count: Array.isArray(saved.execution_results) ? saved.execution_results.length : 0,
      //     execution_results_sample: Array.isArray(saved.execution_results) && saved.execution_results.length > 0 
      //       ? saved.execution_results[0] 
      //       : null
      //   });
      // }

      // const totalTime = Date.now() - processStartTime;
      // console.log(`[BackgroundAI] ✅ Processed location update ${update_id}:`, {
      //   rules_analyzed: rules.length,
      //   rules_executed: executionResults.length,
      //   rules_successful: executionResults.filter(r => r.success).length,
      //   execution_results: executionResults.map(r => ({
      //     rule_id: r.rule_id,
      //     success: r.success
      //   })),
      //   total_time: `${totalTime}ms`
      // });
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error processing location update ${update_id}:`, error.message);
      // console.error(`[BackgroundAI] ❌ Error stack:`, error.stack);
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
   * Matches rules from ALL users based on location/radius, not just the user who sent the update
   */
  async getActiveRulesForLocation(latitude, longitude, publicKey) {
    try {
      // Get rules that are:
      // 1. Active
      // 2. Match based on location/radius (from ANY user, not just the user who sent the update)
      // 3. Either target this specific wallet OR target any wallet (target_wallet_public_key IS NULL)
      // 4. Location is within rule area (for location/proximity) OR geofence contains location
      // NOTE: We match rules from ALL users, not just the user_id who sent the location update
      // This allows rules created by other users to trigger when a public key enters their radius
      
      const result = await pool.query(
        `SELECT cer.*, cc.contract_address, cc.network, cc.function_mappings, cc.requires_webauthn
         FROM contract_execution_rules cer
         JOIN custom_contracts cc ON cer.contract_id = cc.id
         WHERE cer.is_active = true
           AND cc.is_active = true
           AND (
             cer.target_wallet_public_key IS NULL 
             OR cer.target_wallet_public_key = $3
           )
           AND (
             -- Location-based rules: check if point is within radius
             (cer.rule_type = 'location' 
              AND cer.center_latitude IS NOT NULL 
              AND cer.center_longitude IS NOT NULL
              AND cer.radius_meters IS NOT NULL
              AND ST_DWithin(
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
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
                    ST_SetSRID(ST_MakePoint($2, $1), 4326),
                    g.boundary
                  )
              ))
             OR
             -- Proximity-based rules: check if point is within proximity radius
             (cer.rule_type = 'proximity' 
              AND cer.center_latitude IS NOT NULL 
              AND cer.center_longitude IS NOT NULL
              AND cer.radius_meters IS NOT NULL
              AND ST_DWithin(
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                ST_SetSRID(ST_MakePoint(cer.center_longitude, cer.center_latitude), 4326)::geography,
                cer.radius_meters
              ))
           )
         ORDER BY cer.created_at ASC`,
        [latitude, longitude, publicKey]
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
      // console.log(`[BackgroundAI] 🔨 Executing contract rule ${rule.id} (${rule.function_name}) for public key ${publicKey?.substring(0, 8)}...`);
      
      // For read-only functions, we can simulate without secret key
      // For write functions, we need secret key - but we don't have it in background service
      // So we'll mark it as executed but note that actual contract call requires manual execution
      const readOnlyPatterns = ['get_', 'is_', 'has_', 'check_', 'query_', 'view_', 'read_', 'fetch_', 'test'];
      const isReadOnly = readOnlyPatterns.some(pattern => rule.function_name.toLowerCase().startsWith(pattern));
      
      if (isReadOnly) {
        // Check if rule has submit_readonly_to_ledger enabled
        // console.log(`[BackgroundAI] 🔍 Read-only function check for rule ${rule.id}:`, {
        //   submit_readonly_to_ledger: rule.submit_readonly_to_ledger,
        //   submit_readonly_to_ledger_type: typeof rule.submit_readonly_to_ledger,
        //   submit_readonly_to_ledger_truthy: !!rule.submit_readonly_to_ledger
        // });
        
        if (rule.submit_readonly_to_ledger) {
          // Submit read-only function to ledger using service account
          // console.log(`[BackgroundAI] 📤 Rule ${rule.id} has submit_readonly_to_ledger enabled - submitting to ledger`);
          try {
            const result = await this.submitReadOnlyToLedger(rule, parameters, publicKey);
            return result;
          } catch (error) {
            console.error(`[BackgroundAI] ❌ Error submitting read-only function to ledger:`, error.message);
            // Fall back to simulation if submission fails
            // console.log(`[BackgroundAI] ⚠️ Falling back to simulation for rule ${rule.id}`);
          }
        }
        // else {
        //   console.log(`[BackgroundAI] ℹ️ Rule ${rule.id} does not have submit_readonly_to_ledger enabled - using simulation`);
        // }
        
        // For read-only functions, we can simulate the call
        // Generate a mock transaction hash for tracking
        const mockTxHash = `sim_${Date.now()}_${rule.id}_${Math.random().toString(36).substring(7)}`;
        
        // console.log(`[BackgroundAI] ✅ Read-only function executed (simulated) - Rule ${rule.id}`);
        
        return {
          rule_id: rule.id,
          function_name: rule.function_name,
          parameters: parameters,
          public_key: publicKey,
          success: true,
          completed: true,
          transaction_hash: mockTxHash,
          completed_at: new Date().toISOString(),
          execution_type: 'simulated',
          note: 'Read-only function executed via simulation'
        };
      } else {
        // For write functions, we can't execute without secret key
        // But we'll mark it as attempted so it shows in logs
        // console.log(`[BackgroundAI] ⚠️ Write function requires secret key - Rule ${rule.id} cannot be executed automatically`);
        
        return {
          rule_id: rule.id,
          function_name: rule.function_name,
          parameters: parameters,
          public_key: publicKey,
          success: false,
          completed: false,
          error: 'Write functions require secret key for execution. Please execute manually.',
          execution_type: 'requires_manual',
          note: 'Write function requires manual execution with secret key'
        };
      }
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error executing contract rule ${rule.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Submit a read-only function call to the Stellar ledger
   * Uses a service account secret key from environment variables
   */
  async submitReadOnlyToLedger(rule, parameters, publicKey) {
    try {
      const StellarSdk = require('@stellar/stellar-sdk');
      const contracts = require('../config/contracts');
      
      // Get service account secret key from environment
      const serviceAccountSecret = process.env.SERVICE_ACCOUNT_SECRET_KEY;
      if (!serviceAccountSecret) {
        throw new Error('SERVICE_ACCOUNT_SECRET_KEY not configured. Cannot submit read-only functions to ledger.');
      }
      
      // Get contract details
      const contractResult = await pool.query(
        'SELECT contract_address, network FROM custom_contracts WHERE id = $1',
        [rule.contract_id]
      );
      
      if (contractResult.rows.length === 0) {
        throw new Error(`Contract not found for rule ${rule.id}`);
      }
      
      const contract = contractResult.rows[0];
      const networkPassphrase = contract.network === 'mainnet' 
        ? StellarSdk.Networks.PUBLIC 
        : StellarSdk.Networks.TESTNET;
      
      // Get Soroban RPC server
      const rpcUrl = process.env.SOROBAN_RPC_URL || contracts.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
      const sorobanServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
      
      // Get service account
      const keypair = StellarSdk.Keypair.fromSecret(serviceAccountSecret);
      const account = await sorobanServer.getAccount(keypair.publicKey());
      
      // Create contract instance
      const contractInstance = new StellarSdk.Contract(contract.contract_address);
      
      // Convert parameters to ScVal format
      const scValParams = [];
      if (parameters && typeof parameters === 'object') {
        for (const [key, value] of Object.entries(parameters)) {
          // Simple parameter conversion - can be enhanced based on function signature
          if (typeof value === 'string') {
            scValParams.push(StellarSdk.Address.fromString(value));
          } else if (typeof value === 'number') {
            scValParams.push(StellarSdk.nativeToScVal(value, { type: 'i128' }));
          } else if (typeof value === 'boolean') {
            scValParams.push(StellarSdk.xdr.ScVal.scvBool(value));
          } else {
            scValParams.push(StellarSdk.xdr.ScVal.scvString(String(value)));
          }
        }
      }
      
      // Build the contract call operation
      const operation = contractInstance.call(rule.function_name, ...scValParams);
      
      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();
      
      // Prepare transaction (required for Soroban contracts)
      // console.log(`[BackgroundAI] 🔄 Preparing transaction for read-only function: ${rule.function_name}`);
      const preparedTx = await sorobanServer.prepareTransaction(transaction);
      
      // Sign the prepared transaction
      // console.log(`[BackgroundAI] ✍️ Signing transaction...`);
      preparedTx.sign(keypair);
      
      // Submit transaction
      // console.log(`[BackgroundAI] 📤 Submitting read-only function to ledger: ${rule.function_name}`);
      const sendResult = await sorobanServer.sendTransaction(preparedTx);
      // console.log(`[BackgroundAI] ✅ Transaction submitted - Hash: ${sendResult.hash}`);
      
      // Poll for result
      let txResult = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        txResult = await sorobanServer.getTransaction(sendResult.hash);
        if (txResult.status !== 'NOT_FOUND') {
          break;
        }
      }
      
      if (txResult && txResult.status === 'SUCCESS') {
        // console.log(`[BackgroundAI] ✅ Transaction confirmed on ledger - Hash: ${sendResult.hash}`);
        return {
          rule_id: rule.id,
          function_name: rule.function_name,
          parameters: parameters,
          public_key: publicKey,
          success: true,
          completed: true,
          transaction_hash: sendResult.hash,
          completed_at: new Date().toISOString(),
          execution_type: 'submitted_to_ledger',
          note: 'Read-only function submitted to Stellar ledger and visible on Stellar Expert'
        };
      } else {
        throw new Error(`Transaction not confirmed: ${txResult?.status || 'NOT_FOUND'}`);
      }
    } catch (error) {
      console.error(`[BackgroundAI] ❌ Error submitting read-only function to ledger:`, error.message);
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

