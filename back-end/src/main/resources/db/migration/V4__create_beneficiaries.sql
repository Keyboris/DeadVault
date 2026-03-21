CREATE TABLE beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES beneficiary_configs(id),
    position INT NOT NULL DEFAULT 0,         -- 0-based index matching the on-chain beneficiaries[] array
    wallet_address VARCHAR(42) NOT NULL,
    basis_points INT NOT NULL,
    label VARCHAR(255),
    condition VARCHAR(30) NOT NULL DEFAULT 'ALWAYS',    -- ALWAYS | CONDITIONAL_SURVIVAL
    CONSTRAINT chk_basis CHECK (basis_points > 0 AND basis_points <= 10000),
    CONSTRAINT chk_condition CHECK (condition IN ('ALWAYS', 'CONDITIONAL_SURVIVAL'))
);
-- position is used by GracePeriodWatcherJob to call confirmSurvival(index) on the correct
-- on-chain slot for CONDITIONAL_SURVIVAL vaults.