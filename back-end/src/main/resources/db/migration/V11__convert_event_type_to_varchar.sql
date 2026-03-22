-- Hibernate 6 sends @Enumerated(STRING) as varchar, not the PostgreSQL custom enum.
-- PSQLException: column "event_type" is of type event_type but expression is of type varchar
-- Fix: convert to VARCHAR(30) with a check constraint — Hibernate can write to this directly.

ALTER TABLE switch_events
    ALTER COLUMN event_type TYPE VARCHAR(30) USING event_type::text;

ALTER TABLE switch_events
    ADD CONSTRAINT chk_event_type_values
    CHECK (event_type IN ('CHECK_IN','MISSED','GRACE_STARTED','TRIGGERED','EXECUTED','REVOKED'));

DROP TYPE IF EXISTS event_type;