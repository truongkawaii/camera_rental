# Khu quản lý Photobooth

## Mục tiêu và phạm vi

Ảnh và file HTML `Insphoto_Quan_Ly_Web_Co_Bao_Cao_Tai_Chinh.html` mô tả một không gian vận hành Photobooth gồm tổng quan theo ngày, thu tiền khách, nhân viên/ca làm, tiền tại quầy, khách hàng/marketing, báo cáo doanh thu và báo cáo tài chính. Mục Photobooth nằm ngay dưới **Hiệu Suất** trên sidebar chính. Khi vào mục này, người được cấp quyền chuyển sang một workspace có điều hướng riêng và đường quay lại SnapPro. Các mục thiết bị/phụ kiện, sự cố/bảo trì và việc cần làm đã được gỡ khỏi giao diện theo quy trình cửa hàng; dữ liệu cũ được giữ lại.

## Nguyên tắc dữ liệu

- Toàn bộ dữ liệu kinh doanh Photobooth nằm trong các bảng `pb_*`. Không có khóa ngoại tới đơn thuê, thiết bị máy ảnh, khách hàng, chi phí, hoa hồng hoặc bảng lương cũ.
- Quản trị viên cấp hoặc thu hồi quyền Photobooth cho tài khoản nhân viên ở **Quyền Photobooth** trên sidebar. API kiểm tra quyền hiện hành trong cơ sở dữ liệu ở mỗi yêu cầu; tài khoản không được cấp sẽ bị từ chối. Quản trị viên luôn có quyền truy cập.
- Bảng giá và số tồn bắt đầu trống. Người được cấp quyền nhập giá, nhân viên và quà thật trước khi ghi giao dịch.
- Giao dịch chụp lại tên dịch vụ, loại, đơn giá và thành tiền tại thời điểm thu. Sửa bảng giá sau này không làm thay đổi báo cáo quá khứ.
- Quà tặng được trừ tồn và ghi lịch sử biến động trong cùng một database transaction với giao dịch bán.
- Báo cáo tính theo ngày Việt Nam (`Asia/Ho_Chi_Minh`) từ giao dịch Photobooth, không gộp doanh thu thuê máy ảnh.
- Đơn hàng lưu khách, điện thoại, ngày bán, ca, giảm giá, tiền mặt khách đưa, chuyển khoản, tiền thối và tiền mặt thực vào két. Giá có thể điều chỉnh trên từng đơn và được lưu lại cùng đơn.
- Đơn mới chọn nguồn thu: khách tự bỏ tiền vào máy PTB, khách chuyển khoản rồi thu ngân đổi tiền vào máy, hoặc bán thêm tại quầy. Đơn cũ mặc định thuộc nguồn quầy. Doanh thu chỉ ghi một lần; tiền khách bỏ máy không vào quầy, còn khoản đổi tiền ghi chuyển khoản và giảm tiền quầy tương ứng.
- Đối soát máy PTB theo ngày gồm tiền đầu ngày, tiền từ đơn, tiền lấy khỏi máy về quầy/ngân hàng và số kiểm đếm thực tế. Tiền lấy máy về quầy tăng quỹ quầy nhưng không tạo doanh thu mới. Giao dịch tiền máy và kết quả kiểm đếm nằm trong sao lưu Photobooth; bản sao lưu cũ vẫn có thể khôi phục.
- Hủy đơn giữ lại lịch sử, loại đơn khỏi doanh thu/quỹ và hoàn số quà đã tặng. Các khoản chi và bút toán quỹ cũng được hủy mềm thay vì xóa hẳn.
- Tiền tại quầy = tiền đầu ca/ngày + tiền mặt thực từ đơn + thu quỹ khác − chi/rút quỹ. Đổi mệnh giá không đổi tổng quỹ. Chốt quỹ lưu số dự kiến, số đếm thực và chênh lệch.
- Lợi nhuận tạm tính = doanh thu đơn Photobooth − chi phí phát sinh − ADS − mặt bằng − lương nhân viên Photobooth đã ghi nhận. Khoản lương gắn với nhân viên Photobooth và ngày chi, không lấy từ bảng lương Camera. Bút toán quỹ không được trừ lợi nhuận lần nữa.
- Danh sách khách hàng tổng hợp theo số điện thoại; CSV marketing chỉ xuất khách đã đồng ý. Báo cáo đơn và tài chính có CSV và chế độ in.
- Sao lưu/khôi phục JSON chỉ chứa các bảng `pb_*`. Khôi phục phải xác nhận rõ và chạy trong một database transaction; lỗi nhập liệu sẽ rollback toàn bộ.

## Luồng vận hành

1. Thiết lập danh mục dịch vụ, giá, nhân viên và quà tặng.
2. Nhập số tồn quà ban đầu qua thao tác **Nhập / xuất**; mọi lần điều chỉnh có lý do và lịch sử.
3. Xếp ca cho nhân viên.
4. Tại **Thu tiền khách**, chọn nguồn thu trước rồi ghi đơn: dịch vụ, số lượng, đơn giá, giảm giá, khách, nhân viên, ca và quà nếu có. Với đơn bán tại quầy, nhập tiền mặt/chuyển khoản để máy chủ kiểm tra đủ tiền và tính tiền thối. Với đơn máy PTB, máy chủ tự xác định tiền vào máy, tiền quầy và chuyển khoản theo nguồn thu.
5. Ghi tiền đầu ca, khoản thu/chi hoặc đổi mệnh giá; chốt quỹ theo số tiền đếm thực tế. Đối soát riêng tiền trong máy PTB và ghi nhận nơi nhận tiền khi lấy tiền ra khỏi máy.
6. Ghi chi phí Photobooth theo nhóm phát sinh, ADS, mặt bằng hoặc lương gắn với nhân viên Photobooth; xem lợi nhuận theo ngày/tháng.
7. Theo dõi tổng quan ngày, kiểm tra cảnh báo tồn kho quà, xuất báo cáo và sao lưu định kỳ.

## Tiếp nối khi chốt quy trình cửa hàng

- Xác định nhiều chi nhánh Photobooth và quyền nhân viên tại từng chi nhánh (ảnh tham chiếu chỉ có một điểm bán).
- Chốt quy trình hoàn tiền qua ngân hàng/POS và cấp quyền duyệt hủy đơn nếu cửa hàng cần đối soát nhiều người; hiện admin hủy đơn có lý do và lịch sử được giữ lại.
- Kết nối máy POS, QR thanh toán, ca đối soát tiền và in hóa đơn nếu cửa hàng sử dụng.
