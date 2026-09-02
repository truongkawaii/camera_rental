# Hướng Dẫn Cài Đặt & Chạy Local (Local Development Guide)

Tài liệu này hướng dẫn chi tiết cách thiết lập, khởi chạy toàn bộ hệ thống (Frontend, Backend, Database) trên máy local với **dữ liệu mẫu (Mock Data)** hoàn toàn độc lập với Server Production.

---

## 1. Kiến Trúc & Cổng Dịch Vụ Trên Local

| Dịch vụ | URL / Địa chỉ | Cổng (Port) | Mô tả |
| :--- | :--- | :--- | :--- |
| **Admin Frontend** | `http://localhost:5173` | `5173` | React + Vite (Quản trị hệ thống) |
| **User Frontend** | `http://localhost:3000` | `3000` | Next.js 16 (Giao diện khách thuê máy) |
| **Backend API** | `http://localhost:5001/api` | `5001` | Node.js + Express API |
| **PostgreSQL Database** | `localhost:5433` | `5433` | PostgreSQL 16 chạy qua Docker |

> [!NOTE]
> * **Backend chạy port `5001`** để tránh xung đột với tính năng *AirPlay Receiver* mặc định của macOS (thường chiếm port `5000`).
> * **PostgreSQL Local chạy port `5433`** để tránh xung đột nếu máy bạn đã cài PostgreSQL cục bộ (port `5432`).

---

## 2. Yêu Cầu Cài Đặt Trước (Prerequisites)

* **Node.js**: Phiên bản `v18+` hoặc `v20+` (khuyến nghị v20).
* **Docker & Docker Desktop**: Để chạy container PostgreSQL cục bộ.
* **Git**: Quản lý source code.

---

## 3. Các Bước Khởi Chạy Hệ Thống

### Bước 1: Khởi động Database Local (PostgreSQL)

Mở terminal tại thư mục gốc dự án (`snap-pro/`):

```bash
# Khởi động container Postgres
docker compose up -d postgres
```

Kiểm tra container đang chạy:
```bash
docker ps
```
*(Bạn sẽ thấy container `camera_rental_db` đang chạy trên cổng `127.0.0.1:5433->5432/tcp`)*.

---

### Bước 2: Cấu hình File Môi trường (`backend/.env`)

Đảm bảo file `backend/.env` có các cấu hình kết nối local như sau:

```env
# Database Local
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/camera_rental
DB_SSL=false
NODE_ENV=development

# Server Port
PORT=5001
BACKEND_PORT=5001

# Auth & Uploads
JWT_SECRET=local_dev_jwt_secret_key_123456
CLOUDINARY_CLOUD_NAME=dvfgmz0nm
CLOUDINARY_API_KEY=143364827576859
CLOUDINARY_API_SECRET=i9jqh_-b41o5W8NwWYy2C1YACf8
CLOUDINARY_UPLOAD_FOLDER=camera-rental-local
MAX_IMAGES_PER_ENTITY=10
```

---

### Bước 3: Nạp Dữ Liệu Mẫu (Seed Realistic Mock Data)

Hệ thống có sẵn script nạp toàn bộ danh mục, thiết bị, chi nhánh, khách hàng và đơn thuê giả lập:

```bash
cd backend
node scripts/seed_realistic.js
```

Sau khi chạy xong, database local sẽ có sẵn:
* 3 Chi nhánh (CN Quận 1, CN Quận 3, CN Bình Thạnh).
* 5 Vai trò (Admin, Saler, Camera Manager, Investor, Driver).
* 6 Nhân viên mẫu.
* 10 Thiết bị máy ảnh, ống kính, gimbal.
* 12 Đơn thuê mẫu với đầy đủ các trạng thái để test báo cáo/dashboard.

---

### Bước 4: Chạy Backend Server

Tại thư mục `backend/`:

```bash
# Cài đặt thư viện (nếu lần đầu chạy)
npm install

# Khởi chạy chế độ hot-reload
npm run dev
```

* Backend sẽ khởi động tại: **`http://localhost:5001`**
* Kiểm tra API Health: **`http://localhost:5001/api/health`** (Trả về `{"status":"API is running"}`)

---

### Bước 5: Chạy Admin Frontend (React + Vite)

Mở một tab terminal mới:

```bash
cd frontend

# Cài đặt thư viện (nếu lần đầu chạy)
npm install

# Khởi chạy Vite Dev Server
npm run dev
```

* Truy cập Admin Dashboard tại: **`http://localhost:5173`**

---

### Bước 6: Chạy User Frontend (Next.js - Tùy chọn)

Mở một tab terminal mới:

```bash
cd user-fontend

# Cài đặt thư viện (nếu lần đầu chạy)
npm install

# Khởi chạy Next.js Dev Server
npm run dev
```

* Truy cập Giao diện người dùng tại: **`http://localhost:3000`**

---

## 4. Tài Khoản Đăng Nhập Thử Nghiệm

Tất cả các tài khoản test đều sử dụng mật khẩu mặc định: **`password123`**

| Tên đăng nhập | Họ và tên | Quyền hạn (Role) | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **`admin`** | Trần Minh Admin | **Admin** | Toàn quyền quản trị hệ thống |
| **`manager_hcm`** | Nguyễn Thiết Bị | **Camera Manager** | Quản lý kho máy móc, kiểm tra thiết bị |
| **`sale_huy`** | Lê Quang Huy | **Saler** | Tạo đơn thuê, quản lý khách hàng |
| **`sale_an`** | Phạm Thành An | **Saler** | Tạo đơn thuê, theo dõi doanh số |
| **`driver_tuan`** | Đặng Minh Tuấn | **Driver** | Nhận thiết bị, giao nhận hàng |

---

## 5. Xử Lý Các Vấn Đề Thường Gặp (Troubleshooting)

### 1. Báo lỗi `Port 5000 already in use` hoặc `Port 3000 already in use`
* **Port 5000**: Do macOS AirPlay bật sẵn. Dự án đã chuyển Backend sang port `5001`. Nếu vẫn bị chiếm, kiểm tra bằng: `lsof -i :5001`.
* **Port 3000 / 5173**: Kiểm tra tiến trình cũ còn chạy:
  ```bash
  lsof -i :3000
  kill -9 <PID>
  ```

### 2. Không kết nối được Database (`ECONNREFUSED 127.0.0.1:5433`)
* Kiểm tra xem Docker container Postgres đã bật chưa:
  ```bash
  docker compose ps
  # Nếu chưa bật:
  docker compose up -d postgres
  ```

### 3. Muốn xóa sạch database và tạo lại từ đầu
```bash
# Xóa container và dữ liệu volume cũ
docker compose down -v
# Khởi động lại postgres mới tinh
docker compose up -d postgres
# Chạy lại seed
cd backend && node scripts/seed_realistic.js
```
