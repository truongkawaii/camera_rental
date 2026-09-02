#!/bin/sh
# =============================================================================
# Docker Entrypoint — chọn nginx config theo môi trường
# - RENDER=true  → dùng nginx.render.conf (không proxy /api/)
# - Mặc định     → dùng nginx.conf (có proxy sang backend, cho Docker Compose)
# =============================================================================

# Xóa sạch conf.d/ để tránh Nginx load nhầm config cũ
rm -f /etc/nginx/conf.d/*.conf

if [ "$RENDER" = "true" ]; then
  echo "[entrypoint] Render detected — using nginx.render.conf (no API proxy)"
  cp /etc/nginx/templates/nginx.render.conf /etc/nginx/conf.d/default.conf
else
  echo "[entrypoint] Local/Docker Compose — using nginx.conf (with API proxy)"
  cp /etc/nginx/templates/nginx.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"
