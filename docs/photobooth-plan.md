# Khu quản lý Photobooth

## Mục tiêu và phạm vi

Ảnh tham chiếu người dùng cung cấp mô tả một không gian vận hành Photobooth gồm tổng quan theo ngày, thu tiền khách, bảng giá, quà tặng, thiết bị, nhân viên, ca làm, việc cần làm và báo cáo. Mục Photobooth nằm ngay dưới **Hiệu Suất** trên sidebar chính. Khi vào mục này, quản trị viên chuyển sang một workspace có điều hướng riêng và đường quay lại SnapPro.

## Nguyên tắc dữ liệu

- Toàn bộ dữ liệu kinh doanh Photobooth nằm trong các bảng `pb_*`. Không có khóa ngoại tới đơn thuê, thiết bị máy ảnh, khách hàng, chi phí, hoa hồng hoặc bảng lương cũ.
- Chỉ quản trị viên được mở workspace và gọi API `/api/photobooth`. Việc cấp quyền cho nhân viên Photobooth là bước cấu hình riêng khi có quy trình thực tế.
- Bảng giá và số tồn bắt đầu trống. Quản trị viên nhập giá, nhân viên, thiết bị và quà thật trước khi ghi giao dịch.
- Giao dịch chụp lại tên dịch vụ, loại, đơn giá và thành tiền tại thời điểm thu. Sửa bảng giá sau này không làm thay đổi báo cáo quá khứ.
- Quà tặng được trừ tồn và ghi lịch sử biến động trong cùng một database transaction với giao dịch bán.
- Báo cáo tính theo ngày Việt Nam (`Asia/Ho_Chi_Minh`) từ giao dịch Photobooth, không gộp doanh thu thuê máy ảnh.

## Luồng vận hành

1. Thiết lập danh mục dịch vụ, giá, nhân viên, thiết bị và quà tặng.
2. Nhập số tồn quà ban đầu qua thao tác **Nhập / xuất**; mọi lần điều chỉnh có lý do và lịch sử.
3. Xếp ca, giao việc cho nhân viên.
4. Ghi giao dịch: chọn dịch vụ, số lượng, phương thức thanh toán, nguồn khách, người phụ trách và quà tặng nếu có. Giá và thành tiền do máy chủ tính từ danh mục.
5. Theo dõi tổng quan ngày, kiểm tra cảnh báo tồn kho/thiết bị và xem báo cáo theo khoảng ngày.

## Tiếp nối khi chốt quy trình cửa hàng

- Xác định nhiều chi nhánh Photobooth và quyền nhân viên tại từng chi nhánh (ảnh tham chiếu chỉ có một điểm bán).
- Chốt quy trình hủy/hoàn tiền và kiểm soát sửa giao dịch đã thu; hiện giao dịch được ghi như sổ bán hàng, không có xóa/sửa trực tiếp.
- Kết nối máy POS, QR thanh toán, ca đối soát tiền và in hóa đơn nếu cửa hàng sử dụng.
- Bổ sung nhật ký xử lý và người chịu trách nhiệm cho mỗi phiếu sự cố nếu cần quản lý bảo trì chi tiết hơn.
