# Hướng Dẫn Triển Khai & Vận Hành Server (Deployment & DevOps Guide)

Tài liệu này hướng dẫn chi tiết kiến trúc hạ tầng, quy trình triển khai (Deploy), cơ chế sao lưu & đồng bộ dữ liệu (Sync DB), và các thao tác vận hành trên Production Server.

---

## 1. Thông Tin Hạ Tầng Server

* **IP Server**: `163.61.73.126`
* **SSH User**: `root`
* **SSH Command**: `ssh root@163.61.73.126`
* **Thư mục dự án trên Server**: `/home/locdo/camera-rental-prod`
* **Domain Production**: `https://hethongchothuemayanh.com` (và `www.hethongchothuemayanh.com`)
* **Hệ điều hành**: Ubuntu 24.04 LTS (x86_64)
* **Kho mã nguồn (GitHub Repo)**:
  * Repo hiện tại: `https://github.com/truongkawaii/camera_rental`
  * Repo gốc trước chuyển giao: `https://github.com/ducloc2k1/camera-rental`

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
    │   (Node.js / Express)   │             │   (React SPA + PWA)     │
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

Server sử dụng **GitHub Actions Self-hosted Runner** (`systemd service: actions.runner.*`).

1. **Quy trình deploy**:
   * Khi bạn merge hoặc push code lên nhánh **`main`** của repo GitHub.
   * GitHub Actions kích hoạt workflow `.github/workflows/deploy.yml` trực tiếp trên Server.
   * Runner sẽ thực hiện:
     1. Kéo code mới nhất về `/home/locdo/camera-rental-prod`.
     2. Rebuild các container thay đổi (`docker compose up -d --build`).
     3. Tự động chạy migration database (`utils/db.js`).
     4. Khởi động lại Nginx (`docker compose restart nginx`).
     5. Dọn dẹp các Docker image cũ không dùng.

2. **Cách chuyển Runner sang repo mới (`truongkawaii/camera_rental`) khi cần**:
   * Vào repo mới: **Settings** -> **Actions** -> **Runners** -> **New self-hosted runner**.
   * SSH vào server:
     ```bash
     ssh root@163.61.73.126
     cd /home/locdo/actions-runner
     # Gỡ runner cũ
     ./config.sh remove --token <TOKEN_GO_RUNNER_CU>
     # Đăng ký runner cho repo mới
     ./config.sh --url https://github.com/truongkawaii/camera_rental --token <TOKEN_MOI>
     # Khởi động lại service runner
     sudo systemctl restart actions.runner.*
     ```

3. **Kích hoạt deploy thủ công từ giao diện GitHub**:
   * Vào repo GitHub -> Chọn tab **Actions** -> Chọn workflow **Deploy to Ubuntu Server** -> Nhấn **Run workflow**.

---

### Phương pháp 2: Triển Khai Thủ Công Qua SSH

Khi cần cập nhật khẩn cấp hoặc kiểm tra trực tiếp:

1. **SSH vào Server**:
   ```bash
   ssh root@163.61.73.126
   ```

2. **Cập nhật code mới nhất**:
   ```bash
   cd /home/locdo/camera-rental-prod
   # Đảm bảo remote trỏ đúng repo mới
   git remote set-url origin https://github.com/truongkawaii/camera_rental.git
   git fetch origin
   git reset --hard origin/main
   ```

3. **Rebuild và khởi chạy lại dịch vụ**:
   ```bash
   cd /home/locdo/camera-rental-prod/deploy
   # Rebuild và khởi động container
   docker compose up -d --build --remove-orphans

   # Khởi động lại Nginx
   docker compose restart nginx
   ```

4. **Kiểm tra trạng thái hệ thống**:
   ```bash
   docker compose ps
   docker logs --tail=50 camera_rental_backend
   ```

---

## 4. Quản Lý Dữ Liệu & Đồng Bộ (Database, Backup & Sync)

### 1. Đồng bộ dữ liệu từ Production về Local (Pull Prod DB to Local)
Khi cần kéo toàn bộ dữ liệu thực tế về máy cá nhân để kiểm thử:

```bash
# Bước 1: Dump database từ container server về file local (thực hiện trên máy cá nhân)
ssh root@163.61.73.126 "docker exec camera_rental_db pg_dump -U postgres --clean --if-exists camera_rental" > /tmp/prod_dump.sql

# Bước 2: Xóa sạch schema cũ trên PostgreSQL local (container camera_rental_db port 5433)
docker exec -i camera_rental_db psql -U postgres -d camera_rental -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Bước 3: Nạp dữ liệu production vào local
docker exec -i camera_rental_db psql -U postgres -d camera_rental < /tmp/prod_dump.sql

# Bước 4: Chạy migration cập nhật các cột và bảng mới nhất
cd backend && node utils/db.js

# Bước 5: Xóa file dump tạm
rm -f /tmp/prod_dump.sql
```

### 2. Cơ chế sao lưu tự động (Auto Backup)
* Container `camera_rental_backup` chạy ngầm, thực thi script `scripts/backup-db.sh` vào lúc **02:00 sáng mỗi ngày**.
* File `.sql.gz` được nén và đẩy tự động lên Cloudinary thư mục `camera-rental-db-backup`.

### 3. Sao lưu thủ công ngay lập tức trên Server:
```bash
ssh root@163.61.73.126
docker exec -t camera_rental_db pg_dump -U postgres camera_rental | gzip > /tmp/manual_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 4. Khôi phục dữ liệu (Restore DB) trên Server:
```bash
gunzip -c /path/to/backup.sql.gz | docker exec -i camera_rental_db psql -U postgres -d camera_rental
```

---

## 5. Cơ Chế Migration Database Tự Động

Mỗi khi container Backend khởi động, file `utils/db.js` sẽ tự động thực thi hàm `initDB()`:
* Tự động tạo các bảng mới nếu chưa tồn tại (`equipment_transfers`, `activity_logs`, `sales_transfer_logs`, `payroll_snapshots`,...).
* Bổ sung các cột mở rộng mới nhất:
  * `equipment.current_branch_id`: Lưu trữ vị trí cơ sở hiện tại khi thiết bị được điều chuyển.
  * `equipment_maintenance.provider`, `notes`: Phục vụ ghi nhận nhà cung cấp và ghi chú bảo trì trên Calendar.
  * `branches.is_hidden`, `ads_costs.branch_id`, v.v.
* Tự động khởi tạo và chuẩn hóa danh mục quyền (`admin`, `saler`, `camera_manager`, `investor`, `driver`).

---

## 6. Quản Lý Chứng Chỉ SSL (HTTPS Let's Encrypt)

* **Tự động gia hạn (Cron Job)**: Cấu hình trong `crontab` của root server chạy lúc **03:00 sáng hàng ngày**:
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

## 7. Bảng Phân Quyền & Các Tính Năng Trọng Yếu

| Phân hệ / Chức năng | Đường dẫn | Quyền truy cập (Roles) |
| :--- | :--- | :--- |
| **Tổng quan (Dashboard)** | `/` hoặc `/performance` | `admin`, `camera_manager`, `investor`, `driver`, `saler` |
| **Danh sách thiết bị** | `/equipment` | Tất cả roles (Bổ sung cột **Vị trí hiện tại**) |
| **Điều chuyển thiết bị** | `/equipment-transfers` | `admin`, `camera_manager`, `driver` (Kèm thống kê theo cơ sở) |
| **Lịch thuê & Bảo trì** | `/calendar` | Tất cả roles (Tối ưu hiển thị mã thiết bị trên mobile) |
| **Đơn thuê thiết bị** | `/rentals` | Tất cả roles (Driver xem theo cơ sở phụ trách) |
| **Báo cáo nhà đầu tư** | `/investors` | **Chỉ `admin` và `investor`** (Ẩn hoàn toàn với các role khác) |
| **Sổ chuyển tiền & Hoa hồng** | `/sale-transfers`, `/sale-admin-transfers` | `saler` (xem sổ của mình), `admin` (quản lý toàn bộ) |
| **Cấu hình & Quản trị** | `/branches`, `/users`, `/payroll` | **Chỉ `admin`** |

---

## 8. Lệnh Vận Hành Nhanh (Cheatsheet)

| Tác vụ | Lệnh thực hiện |
| :--- | :--- |
| **Xem log Backend** | `docker logs -f --tail=100 camera_rental_backend` |
| **Xem log Nginx** | `docker logs -f --tail=100 camera_rental_nginx` |
| **Xem log Frontend** | `docker logs -f --tail=100 camera_rental_frontend` |
| **Xem log Database** | `docker logs -f --tail=100 camera_rental_db` |
| **Khởi động lại toàn bộ dịch vụ** | `cd /home/locdo/camera-rental-prod/deploy && docker compose restart` |
| **Kiểm tra tài nguyên (RAM/CPU/Disk)** | `htop` hoặc `docker stats` hoặc `df -h` |
| **Kiểm tra trạng thái Runner CI/CD** | `systemctl status actions.runner.*` |

---

## 9. Quy Trình Rollback Khi Gặp Sự Cố

Nếu bản deploy mới nhất phát sinh lỗi ngoài ý muốn:
```bash
ssh root@163.61.73.126
cd /home/locdo/camera-rental-prod

# 1. Quay về commit ổn định trước đó (Ví dụ: commit liền kề trước đó HEAD~1)
git reset --hard HEAD~1

# 2. Rebuild lại containers
cd deploy
docker compose up -d --build

# 3. Restart Nginx
docker compose restart nginx
```
