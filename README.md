# Cantin AI v2.1 — Standalone

Bản quản lý căn tin chạy **độc lập, không phụ thuộc Replit**. Giao diện và luồng sử dụng được giữ theo Cantin AI v2.1: tổng quan, bán hàng nhanh, quản lý mặt hàng, kiểm kho tuần, khách hàng & công nợ, trợ lý AI, xuất CSV và sao lưu JSON.

## Chạy nhanh trên máy tính

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm start
```

Mở: `http://localhost:3000`

Dữ liệu mặc định nằm tại `data/store.json`. Khi không khai báo `DATABASE_URL`, mọi thay đổi được lưu vào file này.

## Bảo vệ bằng PIN

Sao chép `.env.example` thành `.env`, sau đó đặt:

```env
APP_PIN=123456
SESSION_SECRET=mot-chuoi-bi-mat-dai-va-kho-doan
```

Nếu `APP_PIN` bỏ trống, ứng dụng không yêu cầu đăng nhập.

## Dùng PostgreSQL trên hosting/cloud

Đặt biến môi trường:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
PGSSLMODE=require
```

Khi có `DATABASE_URL`, app tự tạo bảng `cantin_app_store` và lưu toàn bộ dữ liệu vào PostgreSQL. Đây là cách nên dùng khi deploy lên cloud để tránh mất dữ liệu khi máy chủ khởi động lại.

## Trợ lý AI

App có trợ lý nội bộ miễn phí, không cần API key. Nếu muốn dùng OpenAI, đặt thêm:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

Nếu OpenAI không khả dụng, app tự chuyển về trợ lý nội bộ.

## Chạy bằng Docker

```bash
docker compose up -d --build
```

Lệnh trên khởi động cả web và PostgreSQL. Truy cập `http://localhost:3000`.

## Deploy không dùng Replit

Có thể đưa thư mục này lên bất kỳ dịch vụ nào chạy Node.js hoặc Docker, ví dụ VPS, Render, Railway, Fly.io, Coolify, Dokploy hoặc máy chủ NAS. Lệnh chạy là:

```bash
npm start
```

Nếu dùng cloud, nên gắn PostgreSQL và khai báo `DATABASE_URL`.

## API/backup sẵn có

- `/api/export/sales.csv` — xuất báo cáo bán hàng CSV.
- `/api/export/backup.json` — tải toàn bộ dữ liệu dạng JSON.
- `/api/health` — kiểm tra trạng thái ứng dụng.

## Cấu trúc chính

- `public/` — giao diện PWA, dùng tốt trên iPhone/iPad/máy tính.
- `server.js` — HTTP server và API.
- `src/store.js` — lớp lưu trữ file/PostgreSQL.
- `src/catalog.js` — danh mục sản phẩm.
- `src/debt-catalog.js` — dữ liệu công nợ nhập ban đầu.
- `data/store.json` — dữ liệu hiện tại khi chạy chế độ file.
