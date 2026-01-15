const pool = require('../config/database');

async function checkRuleSettings(ruleId) {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        rule_name,
        function_name,
        is_active,
        max_executions_per_public_key,
        execution_time_window_seconds,
        min_location_duration_seconds,
        requires_webauthn,
        use_smart_wallet,
        submit_readonly_to_ledger
      FROM contract_execution_rules
      WHERE id = $1`,
      [ruleId]
    );

    if (result.rows.length === 0) {
      console.log(`Rule ID ${ruleId} not found`);
      return;
    }

    const rule = result.rows[0];
    console.log('\n=== Rule Settings ===');
    console.log(`Rule ID: ${rule.id}`);
    console.log(`Rule Name: ${rule.rule_name}`);
    console.log(`Function: ${rule.function_name}`);
    console.log(`Active: ${rule.is_active}`);
    console.log(`\n--- Rate Limiting ---`);
    console.log(`Max Executions Per Public Key: ${rule.max_executions_per_public_key ?? 'NULL (unlimited)'}`);
    console.log(`Time Window (seconds): ${rule.execution_time_window_seconds ?? 'NULL (unlimited)'}`);
    if (rule.max_executions_per_public_key && rule.execution_time_window_seconds) {
      console.log(`Rate Limit: ${rule.max_executions_per_public_key} execution(s) per ${rule.execution_time_window_seconds} seconds`);
    }
    console.log(`\n--- Time-Based Triggers ---`);
    console.log(`Min Location Duration (seconds): ${rule.min_location_duration_seconds ?? 'NULL (no requirement)'}`);
    console.log(`\n--- Other Settings ---`);
    console.log(`Requires WebAuthn: ${rule.requires_webauthn ?? 'NULL'}`);
    console.log(`Use Smart Wallet: ${rule.use_smart_wallet ?? 'NULL'}`);
    console.log(`Submit Read-Only to Ledger: ${rule.submit_readonly_to_ledger ?? 'NULL'} ${rule.submit_readonly_to_ledger ? '✅ ENABLED' : '❌ DISABLED'}`);

    // Check recent executions for a test public key
    const testPublicKey = 'GDFJTET6'; // Partial key from logs
    const executionHistory = await pool.query(
      `SELECT 
        public_key,
        execution_count,
        first_execution_at,
        last_execution_at
      FROM rule_execution_history
      WHERE rule_id = $1
        AND public_key LIKE $2 || '%'
      ORDER BY last_execution_at DESC
      LIMIT 5`,
      [ruleId, testPublicKey]
    );

    if (executionHistory.rows.length > 0) {
      console.log(`\n--- Recent Execution History (for keys starting with ${testPublicKey}...) ---`);
      executionHistory.rows.forEach((exec, idx) => {
        console.log(`\n${idx + 1}. Public Key: ${exec.public_key.substring(0, 8)}...`);
        console.log(`   Execution Count: ${exec.execution_count}`);
        console.log(`   First Execution: ${exec.first_execution_at}`);
        console.log(`   Last Execution: ${exec.last_execution_at}`);
        
        if (rule.execution_time_window_seconds) {
          const timeSinceLastExecution = Math.floor((Date.now() - new Date(exec.last_execution_at).getTime()) / 1000);
          const timeWindowSeconds = rule.execution_time_window_seconds;
          const isWithinWindow = timeSinceLastExecution < timeWindowSeconds;
          console.log(`   Time Since Last Execution: ${timeSinceLastExecution} seconds`);
          console.log(`   Within Time Window (${timeWindowSeconds}s): ${isWithinWindow ? 'YES' : 'NO'}`);
          if (isWithinWindow && exec.execution_count >= rule.max_executions_per_public_key) {
            console.log(`   ⚠️  RATE LIMIT EXCEEDED - Would block execution`);
          }
        }
      });
    } else {
      console.log(`\n--- No execution history found for keys starting with ${testPublicKey}... ---`);
    }

    // Test the can_execute_rule function
    if (executionHistory.rows.length > 0) {
      const testKey = executionHistory.rows[0].public_key;
      const canExecute = await pool.query(
        'SELECT can_execute_rule($1, $2) as can_execute',
        [ruleId, testKey]
      );
      console.log(`\n--- Rate Limit Check Result ---`);
      console.log(`Can Execute for ${testKey.substring(0, 8)}...: ${canExecute.rows[0].can_execute ? 'YES ✅' : 'NO ❌ (Rate Limited)'}`);
    }

  } catch (error) {
    console.error('Error checking rule settings:', error);
  } finally {
    await pool.end();
  }
}

const ruleId = process.argv[2] || 6;
checkRuleSettings(ruleId);
