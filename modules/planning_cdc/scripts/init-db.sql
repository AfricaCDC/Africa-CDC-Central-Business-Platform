-- ─────────────────────────────────────────────────────────────
-- RBM Platform — MySQL 8 init script
-- Mounted at /docker-entrypoint-initdb.d/01-init.sql so it runs
-- the very first time the MySQL container starts on a fresh data
-- volume. Idempotent: safe to re-run.
--
-- Knex migrations create the actual schema once api-server starts.
-- This file exists to:
--   1. Ensure the database exists with the right charset/collation.
--   2. Grant the application user privileges on it.
-- ─────────────────────────────────────────────────────────────

SET NAMES utf8mb4;

-- Production database
CREATE DATABASE IF NOT EXISTS `rbm_platform`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Development database (used by docker-compose.dev.yml)
CREATE DATABASE IF NOT EXISTS `rbm_platform_dev`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Grant the application user full privileges on both databases.
-- The user is created automatically by the MySQL entrypoint from
-- the MYSQL_USER + MYSQL_PASSWORD env vars; here we only ensure it
-- can reach both databases (in case DB_NAME is changed).
GRANT ALL PRIVILEGES ON `rbm_platform`.*     TO 'rbm_user'@'%';
GRANT ALL PRIVILEGES ON `rbm_platform_dev`.* TO 'rbm_user'@'%';

FLUSH PRIVILEGES;
