-- Phase 6: Database Schema
-- Extensions used by later migrations in this set.

create schema if not exists extensions;

-- pgvector: backs the polymorphic `embeddings` table (0006_ai.sql). No ANN
-- index (ivfflat/hnsw) is created anywhere in this migration set — those
-- need tuning against real row counts/data distribution, which don't exist
-- yet. Exact search works fine until that's revisited.
create extension if not exists vector with schema extensions;
