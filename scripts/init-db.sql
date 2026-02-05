-- =============================================================================
-- Dynasty Futures - Database Initialization Script
-- =============================================================================
-- This script runs when the PostgreSQL container is first created.
-- It sets up extensions and any initial configuration.
-- =============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram matching for search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN index support

-- Create schema if needed (Prisma will handle tables)
-- CREATE SCHEMA IF NOT EXISTS dynasty_futures;

-- Grant permissions (useful for read replicas later)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Dynasty Futures database initialization complete';
END $$;
