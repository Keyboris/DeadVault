CREATE TABLE beneficiary_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    raw_intent_text TEXT NOT NULL,
    template_type VARCHAR(50),
    resolved_params JSONB,
    confidence_score NUMERIC(4,3),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    CONSTRAINT chk_bc_status CHECK (status IN ('PENDING_REVIEW','CONFIRMED','DEPLOYED','FAILED'))
);