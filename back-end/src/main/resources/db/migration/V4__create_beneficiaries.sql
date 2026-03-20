CREATE TABLE beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES beneficiary_configs(id),
    wallet_address VARCHAR(42) NOT NULL,
    basis_points INT NOT NULL,
    label VARCHAR(255),
    CONSTRAINT chk_basis CHECK (basis_points > 0 AND basis_points <= 10000)
);