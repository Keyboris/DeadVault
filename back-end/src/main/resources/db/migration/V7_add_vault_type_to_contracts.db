-- Tracks which on-chain contract shape was deployed for each user.
-- Used by ContractDeploymentService to call the correct trigger function.
ALTER TABLE contracts
    ADD COLUMN vault_type VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN unlock_time TIMESTAMPTZ,                          -- populated for TIME_LOCKED vaults
    ADD CONSTRAINT chk_vault_type CHECK (
        vault_type IN ('STANDARD', 'TIME_LOCKED', 'CONDITIONAL_SURVIVAL')
    );