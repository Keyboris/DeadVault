CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
    contract_address VARCHAR(42) NOT NULL UNIQUE,
    deployment_tx_hash VARCHAR(66),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triggered_at TIMESTAMPTZ,
    CONSTRAINT chk_contract_status CHECK (status IN ('ACTIVE','TRIGGERING','TRIGGERED','REVOKED'))
);
CREATE INDEX idx_contracts_status ON contracts(status);