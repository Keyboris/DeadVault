CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
    beneficiary_config_id UUID REFERENCES beneficiary_configs(id),  -- used by GracePeriodWatcherJob
    contract_address VARCHAR(42) NOT NULL UNIQUE,
    deployment_tx_hash VARCHAR(66),
    vault_type VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triggered_at TIMESTAMPTZ,
    CONSTRAINT chk_contract_status CHECK (status IN ('ACTIVE','TRIGGERING','TRIGGERED','REVOKED')),
    CONSTRAINT chk_vault_type CHECK (vault_type IN ('STANDARD','TIME_LOCKED','CONDITIONAL_SURVIVAL'))
);
CREATE INDEX idx_contracts_status ON contracts(status);
-- V7 migration is no longer needed as vault_type is included here from the start.
-- If migrating an existing schema, use V7__add_vault_type_to_contracts.sql instead.