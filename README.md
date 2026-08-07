# Cantin AI v2.4 — Mirror Cloudflare + Supabase

Bản này giữ nguyên cấu trúc giao diện và dữ liệu mẫu của Cantin AI v2.1 tham chiếu, nhưng chạy trên Cloudflare Pages + Supabase Free và không có màn hình đăng nhập PIN.

## Thành phần giữ nguyên từ bản tham chiếu
- Tổng quan: doanh thu/lợi nhuận ngày & tháng, công nợ, hàng sắp hết, kiểm kho gần nhất.
- Bán hàng nhanh: tìm sản phẩm, chọn nhanh, chỉnh số lượng +/−/×, sửa/xóa đơn.
- Mặt hàng: danh sách, thêm/sửa/xóa, giá bán, giá vốn, tồn kho, cảnh báo.
- Kiểm kho tuần: tồn đầu + nhập - tồn cuối, doanh thu, giá vốn, lợi nhuận.
- Khách hàng & Nợ: danh sách khách, khoản nợ, thanh toán, sửa/xóa.
- Trợ lý AI nội bộ miễn phí.
- Xuất CSV và sao lưu JSON.

## Deploy Cloudflare Pages
- Framework preset: None
- Build command: exit 0
- Build output directory: public
- Root directory: để trống

Supabase phải chạy SETUP_SUPABASE_NO_LOGIN.sql một lần.
