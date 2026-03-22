
CREATE TABLE secondary_keyholders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    label          VARCHAR(255),          -- human-readable name (e.g. "Alice Smith")
    email          VARCHAR(255),          -- optional notification address
    added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_keyholder UNIQUE (user_id, wallet_address)
);
 
CREATE INDEX idx_keyholders_user ON secondary_keyholders(user_id);
 

ALTER TABLE users
    ADD COLUMN keyholder_threshold INT NOT NULL DEFAULT 0;

 