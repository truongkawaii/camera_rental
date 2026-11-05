#!/usr/bin/env bash
# Sao chép toàn bộ dữ liệu ứng dụng (schema public) từ production vào PostgreSQL local.
# Không thay đổi production. Chạy từ bất kỳ thư mục nào: ./scripts/sync-production-to-local.sh
set -euo pipefail
umask 077

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
BACKUP_DIR="${PROJECT_ROOT}/backups"
PRODUCTION_SSH_TARGET="${PRODUCTION_SSH_TARGET:-root@163.61.73.126}"
PRODUCTION_DB_CONTAINER="${PRODUCTION_DB_CONTAINER:-camera_rental_db}"

die() { printf 'Lỗi: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }
local_db() { docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c 'exec "$@"' sh "$@"; }

case "${1:-}" in
  '') ;;
  --check) CHECK_ONLY=1 ;;
  -h|--help)
    cat <<'EOF'
Cách dùng: ./scripts/sync-production-to-local.sh [--check]

Mặc định: tải toàn bộ dữ liệu ứng dụng trong schema public từ production,
backup database local rồi ghi đè dữ liệu local trong một transaction.
--check: chỉ kiểm tra kết nối, phiên bản và danh sách bảng; không ghi dữ liệu.

Yêu cầu: Docker Desktop đang chạy, `docker compose up -d postgres`,
SSH tới production và PostgreSQL local đã có schema mới nhất.
EOF
    exit 0 ;;
  *) die "Tham số không hợp lệ. Dùng --help để xem hướng dẫn." ;;
esac

[[ "$PRODUCTION_DB_CONTAINER" =~ ^[a-zA-Z0-9_.-]+$ ]] || die 'Tên container production không hợp lệ.'
command -v docker >/dev/null || die 'Không tìm thấy Docker.'
command -v ssh >/dev/null || die 'Không tìm thấy SSH.'
docker info >/dev/null 2>&1 || die 'Docker chưa chạy. Hãy mở Docker Desktop.'
docker compose -f "$COMPOSE_FILE" ps --status running --services | grep -qx postgres || die 'PostgreSQL local chưa chạy. Hãy chạy: docker compose up -d postgres'

remote_db() {
  local sql="$1" escaped
  printf -v escaped '%q' "$sql"
  ssh -o BatchMode=yes "$PRODUCTION_SSH_TARGET" "docker exec $PRODUCTION_DB_CONTAINER psql -X -At -v ON_ERROR_STOP=1 -U postgres -d camera_rental -c $escaped"
}

TABLES_SQL="SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
COLUMNS_SQL="SELECT table_name || '.' || column_name || ':' || udt_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"
info 'Đang kiểm tra database nguồn và đích...'
SOURCE_VERSION="$(remote_db 'SHOW server_version_num')" || die 'Không kết nối được PostgreSQL production.'
LOCAL_VERSION="$(local_db psql -X -At -v ON_ERROR_STOP=1 -U postgres -d camera_rental -c 'SHOW server_version_num')" || die 'Không kết nối được PostgreSQL local.'
SOURCE_TABLES="$(remote_db "$TABLES_SQL")" || die 'Không đọc được bảng production.'
LOCAL_TABLES="$(local_db psql -X -At -v ON_ERROR_STOP=1 -U postgres -d camera_rental -c "$TABLES_SQL")" || die 'Không đọc được bảng local.'
[[ -n "$SOURCE_TABLES" ]] || die 'Production không có bảng ứng dụng trong schema public.'
if [[ "$SOURCE_TABLES" != "$LOCAL_TABLES" ]]; then
  info 'Danh sách bảng production và local khác nhau. Hãy cập nhật code/migration local rồi chạy lại.'
  diff -u <(printf '%s\n' "$SOURCE_TABLES") <(printf '%s\n' "$LOCAL_TABLES") || true
  exit 1
fi
SOURCE_COLUMNS="$(remote_db "$COLUMNS_SQL")" || die 'Không đọc được cấu trúc cột production.'
LOCAL_COLUMNS="$(local_db psql -X -At -v ON_ERROR_STOP=1 -U postgres -d camera_rental -c "$COLUMNS_SQL")" || die 'Không đọc được cấu trúc cột local.'
if [[ "$SOURCE_COLUMNS" != "$LOCAL_COLUMNS" ]]; then
  info 'Cấu trúc cột production và local khác nhau. Hãy chạy migration local rồi thử lại.'
  diff -u <(printf '%s\n' "$SOURCE_COLUMNS") <(printf '%s\n' "$LOCAL_COLUMNS") || true
  exit 1
fi
TABLE_COUNT="$(printf '%s\n' "$SOURCE_TABLES" | wc -l | tr -d ' ')"
info "Production PostgreSQL ${SOURCE_VERSION}; local PostgreSQL ${LOCAL_VERSION}; ${TABLE_COUNT} bảng public khớp."
if [[ "${CHECK_ONLY:-0}" == 1 ]]; then
  info 'Kiểm tra xong. Chưa thay đổi dữ liệu.'
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
SOURCE_DUMP="$(mktemp "${BACKUP_DIR}/production_public_${STAMP}_XXXXXX.sql")"
LOCAL_BACKUP="${BACKUP_DIR}/local_before_sync_${STAMP}.dump"
chmod 600 "$SOURCE_DUMP"
cleanup() { rm -f "$SOURCE_DUMP"; }
trap cleanup EXIT

info 'Đang tải bản sao dữ liệu production (chỉ đọc)...'
ssh -o BatchMode=yes "$PRODUCTION_SSH_TARGET" \
  "docker exec $PRODUCTION_DB_CONTAINER pg_dump -U postgres -d camera_rental --data-only --schema=public --disable-triggers --no-owner --no-acl" \
  > "$SOURCE_DUMP" || die 'Không tải được dump production; local chưa thay đổi.'
[[ -s "$SOURCE_DUMP" ]] || die 'Dump production rỗng; local chưa thay đổi.'
grep -q '^-- PostgreSQL database dump complete' "$SOURCE_DUMP" || die 'Dump production chưa hoàn chỉnh; local chưa thay đổi.'

info 'Đang backup database local trước khi ghi đè...'
local_db pg_dump -U postgres -d camera_rental --format=custom --no-owner --no-acl > "$LOCAL_BACKUP" || die 'Backup local thất bại; chưa ghi đè.'
[[ -s "$LOCAL_BACKUP" ]] || die 'Backup local rỗng; chưa ghi đè.'
chmod 600 "$LOCAL_BACKUP"
info "Backup local: $LOCAL_BACKUP"
info "Đích ghi đè: Docker local / database camera_rental / ${TABLE_COUNT} bảng public."
info 'Production chỉ được đọc. Các schema ngoài public không được thay đổi.'
read -r -p 'Nhập GHI DE LOCAL để tiếp tục: ' confirmation
[[ "$confirmation" == 'GHI DE LOCAL' ]] || die 'Đã hủy. Local chưa thay đổi; backup local vẫn được giữ.'

# pg_dump 17 thêm ba dòng không được psql 16 hiểu. Lọc đúng các dòng
# điều khiển này; phần COPY và dữ liệu bảng được giữ nguyên.
info 'Đang ghi đè dữ liệu local trong một transaction...'
{
  cat <<'SQL'
DO $sync$
DECLARE tables_to_clear text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
    INTO tables_to_clear FROM pg_tables WHERE schemaname='public';
  EXECUTE 'TRUNCATE TABLE ' || tables_to_clear || ' RESTART IDENTITY';
END
$sync$;
SQL
  sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' -e '/^SET transaction_timeout = 0;$/d' "$SOURCE_DUMP"
} | local_db psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U postgres -d camera_rental -f - \
  || die "Khôi phục thất bại; transaction đã rollback. Backup local: $LOCAL_BACKUP"

info "Đồng bộ thành công ${TABLE_COUNT} bảng public. Backup local: $LOCAL_BACKUP"
