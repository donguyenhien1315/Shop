# Cantin AI v2.1 — Cloudflare Pages + Supabase

Bản miễn phí để triển khai trên Cloudflare Pages, dữ liệu lưu tại Supabase.

## Cloudflare Pages
- Framework preset: None
- Build command: để trống
- Build output directory: `public`
- Root directory: `/`
- Functions: thư mục `functions/` ở root được Cloudflare Pages tự nhận.

## Supabase
Project URL và Publishable key đã được cấu hình sẵn trong `functions/api/[[path]].js`.
Mã PIN không nằm trong mã nguồn; PIN được kiểm tra bằng RPC trên Supabase.

## Lưu ý bảo mật
Publishable key của Supabase được thiết kế để dùng phía client/serverless công khai. Không thêm service_role/secret key vào repo.
