BDHS V3.3.3 — SYNC CONFLICT FIX

Sửa lỗi nút Đồng bộ ngay lặp lại khi Cloud có revision mới hơn.
- Không còn tự đánh dấu dữ liệu thay đổi mỗi lần mở ứng dụng.
- Khi Cloud mới hơn và thiết bị có dữ liệu chờ gửi, Đồng bộ ngay sẽ hỏi rõ trước khi tải Cloud.
- Luôn tạo backup cục bộ trước khi thay dữ liệu trên thiết bị.
- Xóa cờ chờ đồng bộ sau khi nhận Cloud thành công.
- Tăng cache Service Worker để thiết bị nhận đúng mã mới.
