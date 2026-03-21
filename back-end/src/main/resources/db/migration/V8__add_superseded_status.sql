-- V8__add_superseded_status.sql
ALTER TABLE beneficiary_configs
    DROP CONSTRAINT chk_bc_status;

ALTER TABLE beneficiary_configs
    ADD CONSTRAINT chk_bc_status
        CHECK (status IN ('PENDING_REVIEW','CONFIRMED','DEPLOYING','DEPLOYED','FAILED','SUPERSEDED'));