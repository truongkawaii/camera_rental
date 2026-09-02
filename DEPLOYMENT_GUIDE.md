# Hướng Dẫn Triển Khai & Vận Hành Server (Deployment & DevOps Guide)

Tài liệu này hướng dẫn chi tiết quy trình triển khai (Deploy), kiến trúc hạ tầng và các thao tác vận hành trên Production Server.

---

## 1. Thông Tin Hạ Tầng Server

* **IP Server**: `163.61.73.126`
* **SSH User**: `root`
* **SSH Command**: `ssh root@163.61.73.126`
* **Thư mục dự án trên Server**: `/home/locdo/camera-rental-prod`
* **Domain Production**: `https://hethongchothuemayanh.com` (và `www.hethongchothuemayanh.com`)
* **Hệ điều hành**: Ubuntu 24.04 LTS (x86_64)

---

## 2. Kiến Trúc Hệ Thống Trên Production

Hệ thống chạy hoàn toàn bằng **Docker Compose** với Nginx đóng vai trò là Reverse Proxy và SSL Termination:

```text
                                  Internet
                                     │
                             (Port 80 / 443)
                                     ▼
                     ┌──────────────────────────────┐
                     │     camera_rental_nginx      │
                     │  (Nginx Reverse Proxy + SSL) │
                     └───────────────┬──────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
           (Proxy /api/*)                            (Proxy /)
                 ▼                                       ▼
    ┌─────────────────────────┐             ┌─────────────────────────┐
    │  camera_rental_backend  │             │ camera_rental_frontend  │
    │   (Node.js / Express)   │             │   (React SPA in Nginx)  │
    │       Port: 5000        │             │        Port: 80         │
    └────────────┬────────────┘             └─────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────┐             ┌─────────────────────────┐
    │    camera_rental_db     │◄────────────┤  camera_rental_backup   │
    │  (PostgreSQL 17 Alpine) │  Daily Dump │  (Cron 02:00 AM -> CDN) │
    └─────────────────────────┘             └─────────────────────────┘
```

---

## 3. Cơ Chế Triển Khai (Deployment Workflow)

### Phương pháp 1: Tự Động Triển Khai (CI/CD với GitHub Actions) ⭐ [Khuyến nghị]

Server đã được cài đặt sẵn **GitHub Actions Self-hosted Runner** (`actions.runner.ducloc2k1-camera-rental.vm07091741.service`).

1. **Quy trình deploy**:
   * Khi bạn merge / push code lên nhánh **`main`** của repo GitHub `ducloc2k1/camera-rental`.
   * GitHub Actions sẽ tự động kích hoạt workflow `.github/workflows/deploy.yml` trên Server.
   * Runner sẽ thực hiện:
     1. Kéo code mới nhất về `/home/locdo/camera-rental-prod`.
     2. Rebuild các container thay đổi (`docker compose up -d --build`).
     3. Tự động chạy migration database (thực thi trong file `server.js`).
     4. Khởi động lại Nginx (`docker compose restart nginx`).
     5. Dọn dẹp các Docker image cũ không dùng.

2. **Cách kích hoạt thủ công từ giao diện GitHub**:
   * Vào repo GitHub -> Chọn tab **Actions** -> Chọn workflow **Deploy to Ubuntu Server** -> Nhấn **Run workflow**.

---

### Phương pháp 2: Triển Khai Thủ Công Qua SSH

Khi cần can thiệp trực tiếp hoặc sửa lỗi khẩn cấp trên server:

1. **SSH vào Server**:
   ```bash
   ssh root@163.61.73.126
   ```

2. **Di chuyển vào thư mục deploy**:
   ```bash
   cd /home/locdo/camera-rental-prod/deploy
   ```

3. **Cập nhật code từ Git**:
   ```bash
   cd /home/locdo/camera-rental-prod
   git fetch origin
   git reset --hard origin/main
   ```

4. **Rebuild & Khởi động lại dịch vụ**:
   ```bash
   cd /home/locdo/camera-rental-prod/deploy
   # Rebuild và chạy ngầm
   docker compose up -d --build --remove-orphans

   # Khởi động lại Nginx
   docker compose restart nginx
   ```

5. **Kiểm tra trạng thái các container**:
   ```bash
   docker compose ps
   ```

---

## 4. Quản Lý Cơ Sở Dữ Liệu & Sao Lưu (Database & Backups)

### 1. Cơ chế Tự Động Sao Lưu (Auto Backup)
* Container `camera_rental_backup` chạy nền và tự động chạy script `scripts/backup-db.sh` vào lúc **02:00 sáng mỗi ngày**.
* File `.sql.gz` được nén và đẩy trực tiếp lên Cloudinary folder `camera-rental-db-backup`.

### 2. Backup thủ công ngay lập tức:
```bash
ssh root@163.61.73.126
docker exec -t camera_rental_db pg_dump -U postgres camera_rental | gzip > /backups/manual_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 3. Khôi phục dữ liệu (Restore DB):
```bash
# Giải nén và restore vào database
gunzip -c /path/to/backup.sql.gz | docker exec -i camera_rental_db psql -U postgres -d camera_rental
```

---

## 5. Quản Lý Chứng Chỉ SSL (HTTPS Let's Encrypt)

* **Tự động gia hạn (Cron Job)**: Đã được cấu hình trong `crontab` của root server chạy lúc **03:00 sáng hàng ngày**:
  ```cron
  0 3 * * * cd /home/locdo/camera-rental-prod/deploy && docker compose run --rm certbot renew && docker compose restart nginx
  ```

* **Gia hạn chứng chỉ thủ công khi cần**:
  ```bash
  cd /home/locdo/camera-rental-prod/deploy
  docker compose run --rm certbot renew
  docker compose restart nginx
  ```

---

## 6. Lệnh Vận Hành Nhanh (Cheatsheet)

| Tác vụ | Lệnh thực hiện |
| :--- | :--- |
| **Xem log Backend** | `docker logs -f --tail=100 camera_rental_backend` |
| **Xem log Nginx** | `docker logs -f --tail=100 camera_rental_nginx` |
| **Xem log Frontend** | `docker logs -f --tail=100 camera_rental_frontend` |
| **Khởi động lại toàn bộ** | `cd /home/locdo/camera-rental-prod/deploy && docker compose restart` |
| **Kiểm tra tài nguyên (RAM/CPU/Disk)** | `htop` hoặc `docker stats` hoặc `df -h` |
| **Kiểm tra Runner CI/CD** | `systemctl status actions.runner.ducloc2k1-camera-rental.vm07091741.service` |

---

## 7. Quy Trình Rollback Khi Gặp Sự Cố

Nếu bản deploy mới nhất bị lỗi:
```bash
ssh root@163.61.73.126
cd /home/locdo/camera-rental-prod

# 1. Quay về commit ổn định trước đó (Ví dụ: HEAD~1)
git reset --hard HEAD~1

# 2. Rebuild lại containers
cd deploy
docker compose up -d --build

# 3. Restart Nginx
docker compose restart nginx
```
