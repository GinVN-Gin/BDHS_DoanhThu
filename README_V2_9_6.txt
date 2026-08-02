V2.9.6 - Account Data Isolation
- Tách dữ liệu local theo branchId.
- Chuyển tài khoản sẽ lưu cache chi nhánh cũ, nạp cache chi nhánh mới và reload.
- Đăng xuất không còn để dữ liệu chi nhánh cũ hiện dưới tài khoản khác.
- Pending sync và backup trước pull được tách theo chi nhánh.

LƯU Ý NÂNG CẤP:
- Trên thiết bị đang đăng nhập, mở bản mới khi vẫn còn đúng tài khoản để hệ thống gắn dữ liệu local hiện tại vào đúng chi nhánh.
- Không tải lên Cloud bằng tài khoản khác trước khi kiểm tra dữ liệu đã tách đúng.
