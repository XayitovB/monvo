-- PostgreSQL init script
-- Replica va asosiy konfiguratsiya uchun

-- Replication foydalanuvchisi yaratish
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_pass_2024';

-- Finance ilova uchun ma'lumotlar bazasi (agar yo'q bo'lsa)
-- CREATE DATABASE finance;

-- Performance sozlamalari
ALTER SYSTEM SET max_connections = '200';
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET wal_buffers = '8MB';
ALTER SYSTEM SET default_statistics_target = '100';
ALTER SYSTEM SET random_page_cost = '1.1';
ALTER SYSTEM SET effective_io_concurrency = '200';

-- WAL (Write-Ahead Log) — Replica uchun
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET max_wal_senders = '3';
ALTER SYSTEM SET max_replication_slots = '3';

SELECT pg_reload_conf();
