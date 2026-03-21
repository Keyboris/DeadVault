-- V9__fix_confidence_score_type.sql
-- BeneficiaryConfig.java maps confidenceScore as Double, which Hibernate
-- resolves to float8 (double precision). The original V3 migration created
-- the column as NUMERIC(4,3), causing a schema-validation failure on startup.
-- This migration aligns the DB column type with the JPA entity.
ALTER TABLE beneficiary_configs
    ALTER COLUMN confidence_score TYPE FLOAT8
        USING confidence_score::FLOAT8;