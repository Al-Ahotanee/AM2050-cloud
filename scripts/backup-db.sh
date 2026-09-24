#!/usr/bin/env bash
# ==============================================================================
# AM2050 — Automated Production Database Backup Script
# Performs a compressed MySQL snapshot with SSL, single-transaction isolation,
# and 30-day retention pruning.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${APP_ROOT}/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Load environment variables safely
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASS|BACKUP_DIR)=' "$ENV_FILE")
  set +a
else
  echo "[ERROR] Environment file not found at ${ENV_FILE}" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-am2050-mysql-db.mysql.database.azure.com}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-am2050_production}"
DB_USER="${DB_USER:-am2050admin}"
DB_PASS="${DB_PASS:-}"
BACKUP_DIR="${BACKUP_DIR:-${APP_ROOT}/backups}"

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
BACKUP_FILE="${BACKUP_DIR}/am2050_backup_${TIMESTAMP}.sql.gz"
LOG_PREFIX="[AM2050 BACKUP $(date -u +"%Y-%m-%dT%H:%M:%SZ")]"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "${LOG_PREFIX} Starting database backup for '${DB_NAME}' on '${DB_HOST}'..."

# Execute mysqldump with single-transaction (no lock tables) and gzip compression
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASS}" \
  --ssl-mode=REQUIRED \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --hex-blob \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"
FILE_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"

echo "${LOG_PREFIX} Backup completed successfully: ${BACKUP_FILE} (${FILE_SIZE})"

# Enforce 30-day retention (delete snapshots older than 30 days)
PRUNED_COUNT="$(find "${BACKUP_DIR}" -name "am2050_backup_*.sql.gz" -type f -mtime +30 -print -delete | wc -l)"
if [[ "$PRUNED_COUNT" -gt 0 ]]; then
  echo "${LOG_PREFIX} Pruned ${PRUNED_COUNT} backup snapshot(s) older than 30 days."
fi

echo "${LOG_PREFIX} Backup routine finished cleanly."
