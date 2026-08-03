BDHS V3.3.6 - FASTER CLOUD DETECTION

- Kiểm tra revision Cloud mỗi 2 giây khi ứng dụng đang mở.
- Sau khi Push thành công, kiểm tra tăng cường sau 0,8 giây, 2 giây và 5 giây.
- Khi ứng dụng quay lại từ nền, kiểm tra gần như ngay lập tức.
- Khi mạng trở lại, kiểm tra ngay và kiểm tra bổ sung.
- Request lỗi được thử lại từ sau 1 giây.
- Giữ nguyên cơ chế hợp nhất xung đột và lưu local trước.
- Đổi Service Worker cache để thiết bị nhận đúng phiên bản mới.
