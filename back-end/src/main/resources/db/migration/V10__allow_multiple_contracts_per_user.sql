-- V10__allow_multiple_contracts_per_user.sql
-- The unique constraint on user_id was fine when one user = one vault forever.
-- UpdateWillService revokes the old vault and creates a new row for the same user,
-- so we need to allow multiple rows per user and query by status instead.
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_user_id_key;
CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id);