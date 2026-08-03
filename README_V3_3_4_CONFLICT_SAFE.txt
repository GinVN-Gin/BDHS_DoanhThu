BDHS V3.3.4 - CONFLICT SAFE SYNC

- Hợp nhất dữ liệu khi hai thiết bị nhập gần như cùng lúc.
- Không còn chọn một bản rồi ghi đè toàn bộ bản còn lại.
- Doanh thu hợp nhất theo ngày; khoản mua và đơn MTF theo ID; kiểm kê theo tháng.
- Ghi nhận xóa bằng tombstone để dữ liệu đã xóa không tự xuất hiện lại.
- Nếu hai máy tạo đơn MTF trùng mã cùng lúc, app tự đổi mã đơn sau thành số kế tiếp và cập nhật khoản mua liên kết.
- Nếu cùng sửa đúng một bản ghi, bản có updatedAt mới hơn được giữ.
- Nếu dữ liệu thay đổi thêm trong lúc đang gửi Cloud, cờ chờ đồng bộ không bị xóa nhầm.
- Trước khi hợp nhất xung đột, app tự tạo backup cục bộ.

Không thay đổi công thức nghiệp vụ hoặc giao diện chính.
