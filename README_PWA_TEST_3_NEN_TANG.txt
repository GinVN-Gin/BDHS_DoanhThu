BDHS V2.9.3 PWA — TEST PC / ANDROID / iPHONE

QUAN TRỌNG
- PWA phải chạy qua HTTPS (GitHub Pages, Cloudflare Pages, Netlify...) hoặc localhost.
- Không mở index.html bằng file:/// vì Service Worker và một số chức năng sẽ không chạy đúng.
- Cloud Sync vẫn dùng Apps Script hiện tại; không cần sửa server.

1) TEST NHANH TRÊN PC TRONG CÙNG MẠNG
- Mở thư mục bằng VS Code và Live Server.
- Địa chỉ localhost chỉ chạy trên chính PC. Muốn điện thoại truy cập cùng Wi-Fi, bật "Use Local IP" trong Live Server hoặc dùng lệnh: python -m http.server 8080 --bind 0.0.0.0
- Trên điện thoại mở http://IP-CUA-PC:8080 (cách này chỉ test giao diện; cài PWA ổn định nên dùng HTTPS).

2) ĐƯA LÊN GITHUB PAGES (KHUYẾN NGHỊ ĐỂ TEST 3 NỀN TẢNG)
- Tạo repository mới, ví dụ bdhs-app (nên để Private nếu gói GitHub của bạn hỗ trợ Pages cho private; nếu repo Public thì source web sẽ công khai).
- Upload toàn bộ NỘI DUNG bên trong thư mục này lên nhánh main, để index.html nằm ngay thư mục gốc.
- GitHub > Settings > Pages > Build and deployment > Deploy from a branch > main / root > Save.
- Chờ vài phút, GitHub cung cấp URL HTTPS dạng https://TEN-TAI-KHOAN.github.io/bdhs-app/

LƯU Ý BẢO MẬT
- Source PWA trên GitHub Pages có thể được người khác xem nếu repository/public site công khai.
- Không để mật khẩu chi nhánh hoặc mã bí mật trong source. App hiện chỉ lưu phiên/tài khoản trên từng thiết bị; server xác thực riêng.

3) PC
- Mở URL HTTPS bằng Chrome hoặc Edge.
- Chrome: biểu tượng Cài đặt ứng dụng ở thanh địa chỉ, hoặc Menu > Cast, save and share > Install BDHS.
- Edge: Menu > Apps > Install this site as an app.

4) ANDROID
- Mở URL HTTPS bằng Chrome.
- Menu ⋮ > Cài đặt ứng dụng / Thêm vào màn hình chính.
- Mở icon BDHS và đăng nhập một lần.

5) iPHONE / iPAD
- Bắt buộc mở URL bằng Safari.
- Nút Chia sẻ > Thêm vào Màn hình chính > Thêm.
- Mở icon BDHS và đăng nhập một lần.

6) TEST OFFLINE + CLOUD
A. Trên PC nhập một dữ liệu test, chờ tự đồng bộ.
B. Trên Android/iPhone mở app cùng tài khoản chi nhánh, kiểm tra dữ liệu tải về.
C. Tắt mạng trên điện thoại, nhập một dữ liệu khác và lưu.
D. Bật mạng lại, giữ app mở vài giây để tự đồng bộ.
E. Mở PC và kiểm tra dữ liệu mới.

7) CẬP NHẬT BẢN MỚI
- Thay các file trên host/GitHub Pages.
- Bản PWA ưu tiên tải index mới khi mở; CSS/JS tự cập nhật nền.
- Nếu thiết bị vẫn giữ bản cũ: đóng app hoàn toàn rồi mở lại; trường hợp đặc biệt xóa dữ liệu website/service worker và cài lại.
