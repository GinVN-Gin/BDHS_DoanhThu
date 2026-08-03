BDHS V3.3.5 FAST SAFE SYNC

- Gửi dữ liệu sau khoảng 0,35 giây kể từ lần lưu cuối.
- Kiểm tra revision Cloud mỗi 5 giây khi ứng dụng đang mở và màn hình sáng.
- Sau mỗi lần Push thành công, kiểm tra lại Cloud sau 1,2 giây để bắt kịp thay đổi đồng thời từ thiết bị khác.
- Giữ nguyên cơ chế hợp nhất xung đột của V3.3.4; tốc độ chỉ là lớp bổ sung, không phải lớp bảo vệ duy nhất.
- Service Worker cache mới để thiết bị nhận đúng cloud-sync.js v335.

Lưu ý: Chrome có thể tạm dừng JavaScript khi ứng dụng chạy nền hoặc màn hình tắt. Khi mở lại, app kiểm tra Cloud sau khoảng 0,25 giây.
