#!/bin/bash
# =============================================================================
# Script cài đặt SSL Let's Encrypt — hethongchothuemayanh.com
# =============================================================================
# Cách dùng:
#   1. Đảm bảo DNS đã trỏ domain về IP server
#   2. cd deploy/
#   3. chmod +x setup-ssl.sh
#   4. sudo ./setup-ssl.sh
# =============================================================================

set -e

# === CẤU HÌNH ===
DOMAIN="hethongchothuemayanh.com"
WWW_DOMAIN="www.hethongchothuemayanh.com"
EMAIL="admin@hethongchothuemayanh.com"
# =================

echo "============================================"
echo " Camera Rental - SSL Setup"
echo " Domain: $DOMAIN"
echo "============================================"
echo ""

# Kiểm tra DNS
echo ">> Kiểm tra DNS..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null)

if [ -n "$SERVER_IP" ]; then
    echo "   Server IP: $SERVER_IP"
    RESOLVED=$(dig +short "$DOMAIN" @8.8.8.8 2>/dev/null || echo "")
    if [ "$RESOLVED" = "$SERVER_IP" ]; then
        echo "   ✓ $DOMAIN → $RESOLVED (đúng)"
    else
        echo "   ✗ $DOMAIN → $RESOLVED (cần trỏ về $SERVER_IP)"
        echo ""
        echo "   Vào DNS provider, tạo A record:"
        echo "   $DOMAIN → $SERVER_IP"
        echo ""
        read -p "   Bỏ qua và tiếp tục? (y/n): " CONTINUE
        if [ "$CONTINUE" != "y" ]; then
            exit 1
        fi
    fi
fi

# Tạo thư mục certbot
echo ""
echo ">> Tạo thư mục certbot..."
mkdir -p ./certbot/www ./certbot/conf

# Lấy chứng chỉ
echo ""
echo ">> Lấy chứng chỉ SSL từ Let's Encrypt..."
docker compose run --rm certbot certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "$WWW_DOMAIN"

echo ""
echo "============================================"
echo " ✓ Chứng chỉ SSL đã được cấp!"
echo "============================================"
echo ""
echo ">> Kích hoạt HTTPS:"
echo ""
echo "  1. Sửa nginx/nginx.conf:"
echo "     - Comment (xóa) toàn bộ 'Giai đoạn 1: HTTP'"
echo "     - Bỏ comment (mở) toàn bộ 'Giai đoạn 2: HTTPS'"
echo ""
echo "  2. Khởi động lại nginx:"
echo "     docker compose restart nginx"
echo ""
echo "  3. Kiểm tra: https://$DOMAIN"
echo ""
echo ">> Gia hạn tự động (thêm vào crontab):"
echo "   crontab -e"
echo "   0 3 1 * * cd $(pwd) && docker compose run --rm certbot renew && docker compose restart nginx"
echo ""
echo "============================================"
