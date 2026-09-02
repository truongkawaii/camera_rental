---
name: git-commit-push
description: 'Git commit và push code. Use when: commit code, push code, git commit, git push, đẩy code, tạo commit, conventional commit.'
argument-hint: '[message] — để trống nếu muốn skill tự đề xuất message'
user-invocable: true
---

# Git Commit & Push

## When to Use
- Cần commit và push code lên remote
- Muốn tạo commit message theo chuẩn Conventional Commits hoặc tự do
- Cần review thay đổi trước khi push
- Xử lý các lỗi thường gặp khi push (rejected, upstream không tồn tại, merge conflict)

## Procedure

### 1. Kiểm tra trạng thái (`git status`)
- Chạy `git status --porcelain` để lấy danh sách file thay đổi.
- Phân loại: **staged** (đã add), **unstaged** (chưa add), **untracked** (file mới).
- Hiển thị danh sách rõ ràng cho user.

### 2. Yêu cầu user chọn file để stage
- Hỏi user muốn stage những file nào:
  - **Tất cả** — `git add .`
  - **Chọn file cụ thể** — liệt kê từng file để user chọn
  - **Bỏ qua file nào đó** — stage tất cả trừ file bị loại
- Không tự ý stage nếu có file nhạy cảm (`.env`, `credentials.*`, `*.pem`, `*.key`). Cảnh báo user nếu phát hiện.
- **Luôn tự động bỏ qua (skip) 3 file deploy config**, không stage, không commit, không push:
  - `docker-compose.yml` (root)
  - `deploy/docker-compose.yml`
  - `deploy/nginx/nginx.conf`

### 3. Review diff
- Sau khi stage, chạy `git diff --cached --stat` để hiển thị tóm tắt.
- Nếu user yêu cầu xem chi tiết: `git diff --cached`.
- Xác nhận với user trước khi commit.

### 4. Tạo commit message

#### Nếu user đã cung cấp message (qua argument-hint):
- Dùng trực tiếp message đó.
- Nếu message không theo chuẩn Conventional Commits, hỏi user có muốn chuẩn hóa không.

#### Nếu chưa có message:
- Tự động phân tích diff để đề xuất message:
  - **File mới** → `feat: add <mô tả>`
  - **Sửa file** → `fix: update <mô tả>` hoặc `refactor: update <mô tả>`
  - **Xóa file** → `chore: remove <mô tả>`
  - **Chỉ sửa docs** → `docs: update <mô tả>`
  - **Config/CI** → `chore: update <mô tả>`
- Đề xuất 2-3 lựa chọn để user chọn hoặc chỉnh sửa.

#### Auto-detect scope:
- Phân tích đường dẫn file đã thay đổi để gợi ý scope:
  - `frontend/src/...` → scope: `frontend`
  - `backend/...` → scope: `backend`
  - `deploy/...`, `nginx/...` → scope: `deploy`
  - `scripts/...` → scope: `scripts`
  - File ở nhiều thư mục → scope: `all` hoặc hỏi user
- Scope được chèn vào message dạng `<type>(<scope>): <description>`

#### Chuẩn Conventional Commits:
```
<type>(<scope>): <description>

<body>
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`

### 5. Commit
- Chạy `git commit -m "<message>"`.
- Nếu có pre-commit hook fail (lint, test), báo lỗi và dừng lại.
- Nếu thành công, hiển thị commit hash ngắn (`git rev-parse --short HEAD`).

### 6. Xác nhận trước khi push
- Hiển thị tóm tắt trước khi push:
  - Branch hiện tại
  - Commit sắp push (hash + message)
  - Remote target
  - Số file và số dòng thay đổi (`git diff --cached --stat`)
- **Hỏi user xác nhận** trước khi thực hiện push.
- Nếu user từ chối → dừng lại, giữ commit local.

### 7. Push
- Kiểm tra upstream branch hiện tại: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`.
- Nếu chưa có upstream → `git push --set-upstream origin <branch>`.
- Nếu đã có upstream → `git push`.

### 8. Xử lý lỗi khi push

| Lỗi | Cách xử lý |
|-----|-----------|
| `rejected (non-fast-forward)` | Remote có commit mới. Dừng lại, hướng dẫn user `git pull --rebase` trước, sau đó push lại. |
| `no upstream branch` | Tự động set upstream với `--set-upstream`. |
| `authentication failed` | Báo user kiểm tra credentials / token. |
| `pre-push hook failed` | Hiển thị output của hook, dừng lại. |
| `merge conflict` khi pull | Hướng dẫn user resolve conflict thủ công, không tự động merge. |

### 9. Xác nhận thành công
- Hiển thị: branch, commit hash, remote URL, số file thay đổi.
- Nếu là conventional commit, có thể gợi ý bước tiếp theo (tạo PR nếu là `feat`).

## Quality Checks
- [ ] Tất cả file nhạy cảm đã được cảnh báo (nếu có)
- [ ] Commit message rõ ràng, có ý nghĩa
- [ ] Không push force trừ khi user yêu cầu rõ ràng
- [ ] Push thành công hoặc lỗi được xử lý rõ ràng

## Safety Rules
- **KHÔNG BAO GIỜ** tự động `--force` push.
- **KHÔNG BAO GIỜ** commit file `.env`, `credentials.*`, `*.pem`, `*.key`.
- **KHÔNG BAO GIỜ** commit các file deploy config sau (luôn skip):
  - `docker-compose.yml` (root)
  - `deploy/docker-compose.yml`
  - `deploy/nginx/nginx.conf`
- **Luôn hỏi** trước khi amend commit đã push.
- **Luôn kiểm tra** branch hiện tại trước khi push (tránh push nhầm `main`/`master`).
