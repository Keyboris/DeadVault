CREATE TABLE check_in_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    interval_days INT NOT NULL DEFAULT 30,
    grace_period_days INT NOT NULL DEFAULT 7,
    last_check_in_at TIMESTAMPTZ,
    next_due_at TIMESTAMPTZ,
    grace_expires_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE','GRACE','TRIGGERED','REVOKED'))
);
CREATE INDEX idx_checkin_next_due ON check_in_configs(next_due_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_checkin_grace ON check_in_configs(grace_expires_at) WHERE status = 'GRACE';