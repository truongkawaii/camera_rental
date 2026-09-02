#!/bin/bash
# =============================================================================
# Database Backup Script — Camera Rental
#
# Usage:
#   ./scripts/backup-db.sh                  # backup local Docker PostgreSQL
#   ./scripts/backup-db.sh <DATABASE_URL>   # backup remote PostgreSQL
#
# Crontab (daily at 2:00 AM):
#   0 2 * * * /path/to/scripts/backup-db.sh >> /var/log/camera-rental-backup.log 2>&1
# =============================================================================

set -euo pipefail

# =============================================================================
# Auto-load .env from deploy/ (same file Docker Compose uses)
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
ENV_FILE="${PROJECT_ROOT}/deploy/.env"

if [ -f "${ENV_FILE}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Loading env from: ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: .env not found at ${ENV_FILE}"
fi

# =============================================================================
# Configuration
# =============================================================================
BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/camera_rental_${TIMESTAMP}.dump"

# Create backup directory if not exists
mkdir -p "${BACKUP_DIR}"

# =============================================================================
# Database Connection
# =============================================================================
if [ $# -ge 1 ]; then
  # Use provided DATABASE_URL
  DATABASE_URL="$1"
else
  # Default: local Docker PostgreSQL
  DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/camera_rental}"
fi

# Parse DATABASE_URL into pg_dump arguments
# Format: postgresql://user:password@host:port/dbname
parse_db_url() {
  local url="$1"
  # Remove protocol
  url="${url#postgresql://}"
  url="${url#postgres://}"
  # Extract user:password
  PGUSER="${url%%:*}"
  url="${url#*:}"
  # Extract password
  PGPASSWORD="${url%%@*}"
  url="${url#*@}"
  # Extract host:port
  PGHOST="${url%%:*}"
  url="${url#*:}"
  # Extract port
  PGPORT="${url%%/*}"
  url="${url#*/}"
  # Extract dbname (remove query params)
  PGDATABASE="${url%%\?*}"
}

parse_db_url "${DATABASE_URL}"

export PGPASSWORD

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup for database: ${PGDATABASE}"

# =============================================================================
# Run pg_dump (use Docker if pg_dump not installed on host)
# =============================================================================
PG_CONTAINER="${PG_CONTAINER:-camera_rental_db}"

if command -v pg_dump &> /dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Using host pg_dump..."
  pg_dump \
    --host="${PGHOST}" \
    --port="${PGPORT}" \
    --username="${PGUSER}" \
    --dbname="${PGDATABASE}" \
    --no-owner \
    --no-acl \
    --format=custom \
    --compress=9 \
    --file="${BACKUP_FILE}"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] pg_dump not found on host, using Docker (container: ${PG_CONTAINER})..."
  docker exec -e PGPASSWORD="${PGPASSWORD}" "${PG_CONTAINER}" pg_dump \
    --host="${PGHOST}" \
    --port="${PGPORT}" \
    --username="${PGUSER}" \
    --dbname="${PGDATABASE}" \
    --no-owner \
    --no-acl \
    --format=custom \
    --compress=9 \
    > "${BACKUP_FILE}"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# =============================================================================
# Upload to Cloudinary (no local retention — VPS disk stays clean)
# =============================================================================
if [ -z "${CLOUDINARY_CLOUD_NAME:-}" ] || [ -z "${CLOUDINARY_API_KEY:-}" ] || [ -z "${CLOUDINARY_API_SECRET:-}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Uploading to Cloudinary..."

CLOUD_NAME="${CLOUDINARY_CLOUD_NAME}"
API_KEY="${CLOUDINARY_API_KEY}"
API_SECRET="${CLOUDINARY_API_SECRET}"
FOLDER="${CLOUDINARY_BACKUP_FOLDER:-camera-rental-db-backup}"
PUBLIC_ID="camera_rental_${TIMESTAMP}"
UPLOAD_TIMESTAMP=$(date +%s)

# Build signature: params sorted alphabetically (api_key NOT included) + api_secret
PARAMS="folder=${FOLDER}&public_id=${PUBLIC_ID}&timestamp=${UPLOAD_TIMESTAMP}"
SIGNATURE=$(echo -n "${PARAMS}${API_SECRET}" | openssl dgst -sha1 -hex | awk '{print $NF}')

RESPONSE=$(curl -s -X POST "https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload" \
  -F "file=@${BACKUP_FILE}" \
  -F "api_key=${API_KEY}" \
  -F "timestamp=${UPLOAD_TIMESTAMP}" \
  -F "signature=${SIGNATURE}" \
  -F "folder=${FOLDER}" \
  -F "public_id=${PUBLIC_ID}" \
  -F "resource_type=raw")

if echo "${RESPONSE}" | grep -q '"secure_url"'; then
  SECURE_URL=$(echo "${RESPONSE}" | grep -o '"secure_url":"[^"]*"' | cut -d'"' -f4)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cloudinary upload OK: ${SECURE_URL}"
  # Delete local file — Cloudinary is the only storage
  rm -f "${BACKUP_FILE}"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local file deleted (Cloudinary only)."
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cloudinary upload FAILED: ${RESPONSE}"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local file kept: ${BACKUP_FILE}"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completed successfully."

unset PGPASSWORD
