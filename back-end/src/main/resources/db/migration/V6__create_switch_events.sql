CREATE TYPE event_type AS ENUM (
    'CHECK_IN','MISSED','GRACE_STARTED','TRIGGERED','EXECUTED','REVOKED'
);
CREATE TABLE switch_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    event_type event_type NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_user ON switch_events(user_id, created_at DESC);