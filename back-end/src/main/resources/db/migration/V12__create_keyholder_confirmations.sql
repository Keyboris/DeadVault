-- V12__create_keyholder_confirmations.sql
-- Tracks an active confirmation round opened when a user's grace period expires
-- and they have at least one secondary keyholder configured.
-- The vault is not triggered until confirmations_received >= threshold.
 
CREATE TYPE confirmation_round_status AS ENUM (
    'PENDING',      -- waiting for keyholder votes
    'APPROVED',     -- threshold met — vault trigger dispatched
    'REJECTED',     -- owner checked in again; round cancelled
    'EXPIRED'       -- round timed out without reaching threshold
);
 
CREATE TABLE keyholder_confirmation_rounds (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id),
    contract_id          UUID NOT NULL REFERENCES contracts(id),
    threshold_required   INT  NOT NULL,               -- snapshot of threshold at round creation
    confirmations_received INT NOT NULL DEFAULT 0,
    status               confirmation_round_status NOT NULL DEFAULT 'PENDING',
    expires_at           TIMESTAMPTZ NOT NULL,         -- round auto-expires if not confirmed in time
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at          TIMESTAMPTZ
);
 
CREATE INDEX idx_confirmation_rounds_user ON keyholder_confirmation_rounds(user_id);
CREATE INDEX idx_confirmation_rounds_status ON keyholder_confirmation_rounds(status)
    WHERE status = 'PENDING';
 
-- Individual votes cast by keyholders
CREATE TABLE keyholder_votes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id    UUID NOT NULL REFERENCES keyholder_confirmation_rounds(id) ON DELETE CASCADE,
    keyholder_id UUID NOT NULL REFERENCES secondary_keyholders(id),
    voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_round_keyholder_vote UNIQUE (round_id, keyholder_id)
);
 
CREATE INDEX idx_votes_round ON keyholder_votes(round_id);
 