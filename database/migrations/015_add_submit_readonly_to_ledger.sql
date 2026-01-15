-- Migration: Add submit_readonly_to_ledger column to contract_execution_rules
-- This allows rules to submit read-only function calls to the Stellar ledger
-- so they appear on Stellar Expert for tracking/audit purposes

-- Add column to contract_execution_rules table
ALTER TABLE contract_execution_rules
ADD COLUMN IF NOT EXISTS submit_readonly_to_ledger BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN contract_execution_rules.submit_readonly_to_ledger IS 
'If true, read-only function calls will be submitted to the Stellar ledger as transactions, making them visible on Stellar Expert. Requires a service account secret key to be configured.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_contract_execution_rules_submit_readonly 
ON contract_execution_rules(submit_readonly_to_ledger) 
WHERE submit_readonly_to_ledger = true;
