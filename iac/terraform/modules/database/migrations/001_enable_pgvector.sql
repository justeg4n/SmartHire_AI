-- ============================================
-- Migration 001: Enable pgvector extension
-- ============================================
-- Prerequisites: PostgreSQL 15+ on RDS with pgvector available
-- Verify: SELECT * FROM pg_available_extensions WHERE name = 'vector';
-- Run via: psql -h <rds-endpoint> -U smarthire_admin -d smarthiredb -f 001_enable_pgvector.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Candidate Embeddings (Cohere embed-english-v3 = 1024 dims)
-- ============================================

CREATE TABLE IF NOT EXISTS candidate_embeddings (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL UNIQUE,
    embedding   vector(1024) NOT NULL,
    raw_text    TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_candidate_user
        FOREIGN KEY (user_id)
        REFERENCES "Users" ("Id")
        ON DELETE CASCADE
);

COMMENT ON TABLE candidate_embeddings IS 'Stores Cohere v3 vector embeddings for candidate CVs';
COMMENT ON COLUMN candidate_embeddings.embedding IS 'Cohere embed-english-v3 1024-dimensional vector';
COMMENT ON COLUMN candidate_embeddings.raw_text IS 'Redacted CV text used to generate the embedding';

-- ============================================
-- Job Embeddings
-- ============================================

CREATE TABLE IF NOT EXISTS job_embeddings (
    id          SERIAL PRIMARY KEY,
    job_id      UUID NOT NULL UNIQUE,
    embedding   vector(1024) NOT NULL,
    raw_text    TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_job
        FOREIGN KEY (job_id)
        REFERENCES "Jobs" ("Id")
        ON DELETE CASCADE
);

COMMENT ON TABLE job_embeddings IS 'Stores Cohere v3 vector embeddings for job descriptions';

-- ============================================
-- Candidate Profiles (structured extraction from CV)
-- ============================================

CREATE TABLE IF NOT EXISTS candidate_profiles_ai (
    id                  SERIAL PRIMARY KEY,
    user_id             UUID NOT NULL UNIQUE,
    extracted_profile   JSONB NOT NULL DEFAULT '{}',
    seniority_estimate  VARCHAR(20),
    years_experience    INTEGER,
    matching_score      NUMERIC(5,2),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_profile_user
        FOREIGN KEY (user_id)
        REFERENCES "Users" ("Id")
        ON DELETE CASCADE
);

COMMENT ON TABLE candidate_profiles_ai IS 'AI-extracted structured profile data from candidate CVs';
COMMENT ON COLUMN candidate_profiles_ai.extracted_profile IS 'JSONB: skills, education, experience, strengths, gaps';

-- ============================================
-- HNSW Indexes for fast approximate nearest neighbor search
-- ============================================
-- HNSW provides ~99% recall with much faster queries than IVFFlat
-- m=16, ef_construction=64 are good defaults for 1024-dim vectors

CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_hnsw
    ON candidate_embeddings
    USING hnsw (embedding vector_l2_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_job_embeddings_hnsw
    ON job_embeddings
    USING hnsw (embedding vector_l2_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================
-- Helper indexes for fast lookups
-- ============================================

CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_user_id
    ON candidate_embeddings (user_id);

CREATE INDEX IF NOT EXISTS idx_job_embeddings_job_id
    ON job_embeddings (job_id);

CREATE INDEX IF NOT EXISTS idx_candidate_profiles_ai_user_id
    ON candidate_profiles_ai (user_id);

-- ============================================
-- Trigger: auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_candidate_embeddings_updated_at
    BEFORE UPDATE ON candidate_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_embeddings_updated_at
    BEFORE UPDATE ON job_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidate_profiles_ai_updated_at
    BEFORE UPDATE ON candidate_profiles_ai
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
