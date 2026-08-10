# Cantin Nova

Ứng dụng POS/căn tin tiếng Việt được viết mới hoàn toàn, lấy cảm hứng từ luồng nghiệp vụ của các hệ thống POS hiện đại: bán hàng nhanh, kho, kiểm kho, công nợ, thu/chi và báo cáo. Không sử dụng mã nguồn hoặc giao diện của KiotViet.

## Triển khai tự động thành GitHub + Cloudflare mới

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/donguyenhien1315/Shop/tree/main/templates/cantin-nova)

Khi bấm nút trên và đăng nhập Cloudflare/GitHub, Cloudflare sẽ dùng thư mục template này làm nguồn, tạo một repository mới trong GitHub của bạn, tự tạo Worker + D1 và cấu hình Workers Builds để các lần push tiếp theo tự deploy.

## Kiến trúc mới

- Cloudflare Workers + Static Assets.
- Cloudflare D1 với schema quan hệ mới.
- Backend tách thành `lib`, `queries`, `actions`, `legacy`, `worker`.
- Frontend SPA responsive cho điện thoại và máy tính.
- Dữ liệu cũ chỉ được đọc một lần từ Supabase và chuyển sang D1.
- Trước khi chuẩn hóa, toàn bộ JSON cũ được lưu nguyên bản trong `legacy_backups`.
- Sau khi import xong, hoạt động mới chỉ ghi vào D1; không ghi ngược Supabase.

## Chức năng bản 1.0

- Tổng quan: doanh thu, lợi nhuận, công nợ, tồn kho, đơn gần nhất.
- Bán hàng: tìm sản phẩm, bấm tăng số lượng, +/-/x, nhập trực tiếp số lượng, tiền mặt/chuyển khoản/ghi nợ, giảm giá.
- Công nợ: lọc còn nợ/đã trả, trả nợ, tự tạo khách nếu nhập lệnh nhanh.
- Lệnh nhanh: `Chất nợ 30k 2c` → khách Chất, 30.000đ, ghi chú `2c`.
- Kho: ô số có mũi tên; popup chốt kiểm kho chỉ hiện khi số thực tế thay đổi; có nút × để hủy.
- Thu/chi: phiếu thu, phiếu chi, tiền mặt/chuyển khoản.
- Báo cáo theo khoảng ngày và xuất JSON.
- Nhớ màn hình và vị trí cuộn khi tải lại.
- Hỗ trợ nhiều cửa hàng ở tầng dữ liệu.

## Migration dữ liệu cũ

Sau lần deploy đầu tiên, khi D1 đang trống, app tự gọi nguồn dữ liệu cũ và migrate sang schema mới. Dữ liệu Supabase cũ không bị xóa hoặc chỉnh sửa.

Sau khi đã kiểm tra dữ liệu mới đầy đủ, nên vô hiệu hóa RPC công khai của hệ thống cũ để giảm bề mặt truy cập.
