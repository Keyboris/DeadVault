-- Adds support for multisig vaults to the contracts table.
ALTER TABLE contracts
    ADD COLUMN owners TEXT,
    ADD COLUMN threshold INTEGER,
    ADD COLUMN inactivity_seconds INTEGER,
    ADD COLUMN grace_seconds INTEGER;
