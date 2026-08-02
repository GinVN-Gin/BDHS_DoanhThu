BDHS V2.4.3 - LOGIN + CLOUD RECOVERY

PHẦN A - CẬP NHẬT GOOGLE APPS SCRIPT
1. Mở dự án Apps Script BDHS Sync Server.
2. Mở file AppsScript_Code.gs trong gói này.
3. Copy toàn bộ nội dung và thay toàn bộ Code.gs hiện tại.
4. Lưu.
5. Chạy hàm setupAuthV2() một lần và cấp thêm quyền gửi email nếu Google hỏi.
6. Chạy hàm seedInitialAccounts() một lần.
   - socxoai / Gin12345
   - rachgia / Suong12345
   - email khôi phục: tiennguyen8001@gmail.com
7. Vào Triển khai > Quản lý chế độ triển khai.
8. Chọn deployment hiện tại > Sửa > Phiên bản mới > Triển khai.
   Không tạo URL mới nếu không cần. URL cũ sẽ tiếp tục dùng.

PHẦN B - CHẠY APP
1. Giải nén thư mục app.
2. Mở bằng VS Code + Live Server.
3. Đăng nhập bằng tài khoản chi nhánh.
4. App ghi nhớ tài khoản và phiên đăng nhập trên thiết bị.
5. Quên mật khẩu: mã 6 số được gửi về email khôi phục, hết hạn sau 10 phút.

LƯU Ý
- App không lưu mật khẩu dạng chữ trong localStorage; chỉ lưu phiên đăng nhập.
- Đổi/đặt lại mật khẩu sẽ làm các phiên cũ hết hiệu lực.
- Có nút Dùng ngoại tuyến để vẫn vào app khi Cloud tạm mất kết nối.
- Data Core và công thức không thay đổi.
