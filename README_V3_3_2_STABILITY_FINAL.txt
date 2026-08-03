BDHS V3.3.2 STABILITY FINAL

- Cloud Push debounce 1,8 giây sau thao tác cuối.
- Timeout 18 giây và retry có kiểm soát cho login/session/pull.
- Retry nền 2s / 5s / 15s / 60s khi Cloud chập chờn.
- Kiểm tra revision mỗi 30 giây khi app đang mở.
- Không tải toàn bộ dữ liệu nếu revision không thay đổi.
- Không tự reload PWA giữa lúc người dùng đang nhập liệu.
- Manual Push xóa đúng trạng thái chờ đồng bộ.
- Đối chiếu dữ liệu khi mất phản hồi Push để tránh báo xung đột giả.
- Kiểm kê: Enter/Next chuyển xuống dòng kế tiếp, tự chọn số và tự cuộn khỏi bàn phím.
- Không thay đổi Data Core, công thức hay bố cục giao diện.
