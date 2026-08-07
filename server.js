import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readStore, updateStore, newId, getStorageMode } from "./src/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
await loadEnv(path.join(__dirname, ".env"));
const portFlagIndex = process.argv.indexOf("--port");
const forwardedPort = portFlagIndex >= 0 ? process.argv[portFlagIndex + 1] : "";
const port = Number(forwardedPort || process.env.PORT || 3000);
const appPin = String(process.env.APP_PIN || "").trim();
const sessionSecret = String(process.env.SESSION_SECRET || appPin || "cantin-ai-local-session");

const money = value => Math.round(Number(value) || 0);
const qty = value => Math.max(0, Number(value) || 0);
const dateKey = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const todayKey = () => dateKey(new Date().toISOString());
const monthKey = iso => dateKey(iso).slice(0, 7);

async function loadEnv(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  res.end(body);
}
function sendText(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": contentType, "Content-Length": Buffer.byteLength(body), ...extraHeaders });
  res.end(body);
}
async function readJsonBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error("Dữ liệu gửi lên quá lớn."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Dữ liệu JSON không hợp lệ."), { status: 400 }); }
}
function routeMatch(pathname, pattern) {
  const a = pathname.split("/").filter(Boolean), b = pattern.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < b.length; i += 1) {
    if (b[i].startsWith(":")) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
function bad(message) { throw Object.assign(new Error(message), { status: 400 }); }
function isoAtNoon(date) { return `${date}T05:00:00.000Z`; }
function inDateRange(iso, start, end) { const key = dateKey(iso); return key >= start && key <= end; }
function customerDebtBalance(data, customerId) { return data.debts.filter(d => d.customerId === customerId).reduce((sum, d) => sum + d.balance, 0); }

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function formatMoney(value) { return `${money(value).toLocaleString("vi-VN")} ₫`; }
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(part => part.trim()).filter(Boolean).map(part => { const i = part.indexOf("="); return i < 0 ? [part, ""] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))]; }));
}
function sessionToken() { return createHmac("sha256", sessionSecret).update("cantin-ai-session-v2").digest("hex"); }
function safeEqualText(a, b) {
  const left = Buffer.from(String(a || "")); const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}
function isAuthenticated(req) { return !appPin || safeEqualText(parseCookies(req).cantin_session, sessionToken()); }
function authCookie(req, value, maxAge) {
  const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return `cantin_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function weekRange() {
  const now = new Date(); const key = todayKey(); const day = new Date(`${key}T00:00:00+07:00`).getDay(); const offset = day === 0 ? 6 : day - 1;
  const start = new Date(`${key}T00:00:00+07:00`); start.setDate(start.getDate() - offset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return [dateKey(start.toISOString()), dateKey(end.toISOString())];
}
function salesSummary(data, start, end) {
  const sales = data.sales.filter(s => inDateRange(s.createdAt, start, end));
  return { sales, revenue: sales.reduce((sum, x) => sum + x.total, 0), profit: sales.reduce((sum, x) => sum + x.profit, 0), orders: sales.length };
}
function findMentioned(items, message, key = "name") {
  const normalized = normalizeText(message);
  return items.filter(item => normalizeText(item[key]).length >= 2 && normalized.includes(normalizeText(item[key]))).sort((a, b) => normalizeText(b[key]).length - normalizeText(a[key]).length)[0] || null;
}
function localAssistant(data, message) {
  const q = normalizeText(message);
  const customer = findMentioned(data.customers, message);
  const product = findMentioned(data.products, message);
  const openDebts = data.debts.filter(d => d.balance > 0);
  const totalDebt = openDebts.reduce((sum, d) => sum + d.balance, 0);
  const lowStock = data.products.filter(p => p.active !== false && p.trackStock !== false && p.stock <= p.minStock);

  if (customer && (q.includes("no") || q.includes("con bao nhieu") || q.includes("con lai"))) {
    const debts = openDebts.filter(d => d.customerId === customer.id);
    const balance = debts.reduce((sum, d) => sum + d.balance, 0);
    const details = debts.slice(0, 5).map(d => `${d.note || "Khoản nợ"}: ${formatMoney(d.balance)}`).join("; ");
    return balance > 0 ? `${customer.name} hiện còn nợ ${formatMoney(balance)}${details ? `. Chi tiết: ${details}.` : "."}` : `${customer.name} hiện không còn nợ.`;
  }
  if (product && (q.includes("ton") || q.includes("kho") || q.includes("con bao nhieu") || q.includes("gia"))) {
    const stockText = product.trackStock === false ? "không giới hạn tồn" : `còn ${product.stock.toLocaleString("vi-VN")} ${product.unit}`;
    return `${product.name}: ${stockText}, giá bán ${formatMoney(product.salePrice)}, giá vốn ${formatMoney(product.costPrice)}${product.trackStock !== false && product.stock <= product.minStock ? ". Mặt hàng này đang ở mức cảnh báo nhập thêm." : "."}`;
  }
  if ((q.includes("ai") || q.includes("khach")) && q.includes("no nhieu nhat")) {
    const rows = data.customers.map(c => ({ name: c.name, balance: customerDebtBalance(data, c.id) })).filter(x => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
    return rows.length ? `Khách còn nợ nhiều nhất: ${rows.map((x, i) => `${i + 1}. ${x.name} ${formatMoney(x.balance)}`).join("; ")}.` : "Hiện không có khách hàng nào còn nợ.";
  }
  if (q.includes("tong no") || q.includes("tong con no") || q.includes("cong no")) {
    const customers = new Set(openDebts.map(d => d.customerId)).size;
    return `Tổng công nợ hiện tại là ${formatMoney(totalDebt)}, thuộc ${customers.toLocaleString("vi-VN")} khách hàng.`;
  }
  if (q.includes("sap het") || q.includes("can nhap") || q.includes("nhap them") || q.includes("canh bao")) {
    return lowStock.length ? `Có ${lowStock.length} mặt hàng cần chú ý: ${lowStock.slice(0, 12).map(p => `${p.name} còn ${p.stock} ${p.unit}`).join("; ")}.` : "Hiện chưa có mặt hàng nào chạm mức cảnh báo tồn kho.";
  }
  if (q.includes("bao nhieu san pham") || q.includes("bao nhieu mat hang") || q.includes("danh sach san pham")) {
    const active = data.products.filter(p => p.active !== false);
    return `Kho đang có ${active.length.toLocaleString("vi-VN")} mặt hàng đang hoạt động, thuộc ${new Set(active.map(p => p.category)).size.toLocaleString("vi-VN")} nhóm.`;
  }
  if (q.includes("hom nay") && (q.includes("doanh thu") || q.includes("loi nhuan") || q.includes("ban duoc"))) {
    const key = todayKey(); const s = salesSummary(data, key, key);
    return `Hôm nay có ${s.orders} giao dịch, doanh thu ${formatMoney(s.revenue)}, lợi nhuận ${formatMoney(s.profit)}.`;
  }
  if ((q.includes("thang nay") || q.includes("trong thang")) && (q.includes("doanh thu") || q.includes("loi nhuan"))) {
    const month = todayKey().slice(0, 7); const start = `${month}-01`; const end = `${month}-31`; const s = salesSummary(data, start, end);
    return `Tháng này có ${s.orders} giao dịch, doanh thu ${formatMoney(s.revenue)}, lợi nhuận ${formatMoney(s.profit)}.`;
  }
  if ((q.includes("tuan nay") || q.includes("trong tuan")) && (q.includes("doanh thu") || q.includes("loi nhuan") || q.includes("ban duoc"))) {
    const [start, end] = weekRange(); const s = salesSummary(data, start, end);
    return `Tuần ${start.split("-").reverse().join("/")}–${end.split("-").reverse().join("/")} có ${s.orders} giao dịch, doanh thu ${formatMoney(s.revenue)}, lợi nhuận ${formatMoney(s.profit)}.`;
  }
  if (q.includes("kiem kho") && (q.includes("gan nhat") || q.includes("moi nhat") || q.includes("doanh thu"))) {
    const audit = data.weeklyAudits.slice().sort((a, b) => b.weekEnd.localeCompare(a.weekEnd))[0];
    return audit ? `Kiểm kho gần nhất từ ${audit.weekStart.split("-").reverse().join("/")} đến ${audit.weekEnd.split("-").reverse().join("/")}: bán ${audit.totalSold} sản phẩm, doanh thu ${formatMoney(audit.totalRevenue)}, lợi nhuận ${formatMoney(audit.totalProfit)}.` : "Chưa có dữ liệu kiểm kho tuần.";
  }
  if (q.includes("ai con no") || q.includes("danh sach no") || q.includes("khach dang no")) {
    const rows = data.customers.map(c => ({ name: c.name, balance: customerDebtBalance(data, c.id) })).filter(x => x.balance > 0).sort((a, b) => b.balance - a.balance);
    return rows.length ? `Có ${rows.length} khách còn nợ. Các khoản cao nhất: ${rows.slice(0, 10).map(x => `${x.name} ${formatMoney(x.balance)}`).join("; ")}.` : "Hiện không có khách hàng nào còn nợ.";
  }
  return "Tôi có thể trả lời miễn phí về tồn kho, mặt hàng sắp hết, doanh thu hôm nay/tuần/tháng, kiểm kho gần nhất và công nợ từng khách. Ví dụ: “Long 714 còn nợ bao nhiêu?”, “Mặt hàng nào sắp hết?” hoặc “Doanh thu tuần này bao nhiêu?”.";
}
function applyCustomerPayment(data, customerId, amount, note = "", debtId = "") {
  let remaining = amount;
  const debts = data.debts
    .filter(d => d.customerId === customerId && d.balance > 0 && (!debtId || d.id === debtId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (debtId && !debts.length) bad("Khoản nợ đã chọn không tồn tại hoặc đã được trả hết.");
  const paymentId = newId();
  const createdAt = new Date().toISOString();
  let appliedTotal = 0;
  for (const debt of debts) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, debt.balance);
    debt.paid += applied; debt.balance -= applied;
    debt.payments.push({ id: paymentId, amount: applied, createdAt, note: String(note || "") });
    remaining -= applied; appliedTotal += applied;
  }
  return { appliedTotal, remaining, paymentId, createdAt };
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/health") return sendJson(res, 200, { ok: true, aiConfigured: true, aiMode: process.env.OPENAI_API_KEY ? "hybrid" : "local", storageMode: getStorageMode(), authRequired: Boolean(appPin), authenticated: isAuthenticated(req), version: "2.1-standalone" });

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    if (!appPin || safeEqualText(String(body.pin || "").trim(), appPin)) {
      res.setHeader("Set-Cookie", authCookie(req, sessionToken(), 60 * 60 * 24 * 30));
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 401, { error: "Mã PIN không đúng." });
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    res.setHeader("Set-Cookie", authCookie(req, "", 0));
    return sendJson(res, 200, { ok: true });
  }
  if (!isAuthenticated(req)) return sendJson(res, 401, { error: "Bạn cần đăng nhập để sử dụng ứng dụng." });

  if (req.method === "GET" && pathname === "/api/dashboard") {
    const data = await readStore();
    const today = todayKey(), month = today.slice(0, 7);
    const todaySales = data.sales.filter(s => dateKey(s.createdAt) === today);
    const monthSales = data.sales.filter(s => monthKey(s.createdAt) === month);
    const lowStock = data.products.filter(p => p.active !== false && p.trackStock !== false && p.stock <= p.minStock);
    return sendJson(res, 200, {
      todayRevenue: todaySales.reduce((s, x) => s + x.total, 0), todayProfit: todaySales.reduce((s, x) => s + x.profit, 0), todayOrders: todaySales.length,
      monthRevenue: monthSales.reduce((s, x) => s + x.total, 0), monthProfit: monthSales.reduce((s, x) => s + x.profit, 0),
      debtBalance: data.debts.reduce((s, x) => s + x.balance, 0), customerCount: data.customers.length,
      lowStock, recentSales: data.sales.slice(-8).reverse(), latestAudit: data.weeklyAudits.slice().sort((a,b)=>b.weekEnd.localeCompare(a.weekEnd))[0] || null
    });
  }

  if (req.method === "GET" && pathname === "/api/products") {
    const data = await readStore();
    return sendJson(res, 200, data.products.slice().sort((a, b) => a.category.localeCompare(b.category, "vi") || a.name.localeCompare(b.name, "vi")));
  }
  if (req.method === "POST" && pathname === "/api/products") {
    const body = await readJsonBody(req);
    if (!String(body.name || "").trim()) bad("Tên sản phẩm không được để trống.");
    const product = await updateStore(data => {
      const item = {
        id: newId(), name: String(body.name).trim(), category: String(body.category || "Khác").trim() || "Khác", unit: String(body.unit || "cái").trim() || "cái",
        packSize: Math.max(1, qty(body.packSize) || 1), purchasePrice: money(body.purchasePrice), costPrice: money(body.costPrice), salePrice: money(body.salePrice),
        stock: qty(body.stock), initialStock: qty(body.stock), minStock: qty(body.minStock), trackStock: body.trackStock !== false,
        revenueMode: body.revenueMode === "weekly_inventory" ? "weekly_inventory" : "direct_sale", source: String(body.source || "").trim(), formula: String(body.formula || "").trim(), note: String(body.note || "").trim(), active: body.active !== false
      };
      data.products.push(item); return item;
    });
    return sendJson(res, 201, product);
  }
  const productParams = routeMatch(pathname, "/api/products/:id");
  if (req.method === "PATCH" && productParams) {
    const body = await readJsonBody(req);
    const product = await updateStore(data => {
      const item = data.products.find(p => p.id === productParams.id); if (!item) return null;
      const textKeys = ["name","category","unit","source","formula","note"];
      const moneyKeys = ["purchasePrice","costPrice","salePrice"];
      const qtyKeys = ["packSize","stock","minStock"];
      for (const key of textKeys) if (body[key] !== undefined) item[key] = String(body[key]).trim();
      for (const key of moneyKeys) if (body[key] !== undefined) item[key] = money(body[key]);
      for (const key of qtyKeys) if (body[key] !== undefined) item[key] = key === "packSize" ? Math.max(1, qty(body[key]) || 1) : qty(body[key]);
      if (body.trackStock !== undefined) item.trackStock = Boolean(body.trackStock);
      if (body.active !== undefined) item.active = Boolean(body.active);
      if (body.revenueMode !== undefined) item.revenueMode = body.revenueMode === "weekly_inventory" ? "weekly_inventory" : "direct_sale";
      return item;
    });
    if (!product) return sendJson(res, 404, { error: "Không tìm thấy sản phẩm." });
    return sendJson(res, 200, product);
  }
  if (req.method === "DELETE" && productParams) {
    const result = await updateStore(data => {
      const index = data.products.findIndex(p => p.id === productParams.id);
      if (index < 0) return null;
      return data.products.splice(index, 1)[0];
    });
    if (!result) return sendJson(res, 404, { error: "Không tìm thấy sản phẩm." });
    return sendJson(res, 200, { ok: true, deleted: result });
  }

  if (req.method === "GET" && pathname === "/api/customers") {
    const data = await readStore();
    const list = data.customers.map(c => ({ ...c, debtBalance: customerDebtBalance(data, c.id), debtCount: data.debts.filter(d => d.customerId === c.id && d.balance > 0).length }))
      .sort((a,b)=>(a.sortOrder ?? 9999)-(b.sortOrder ?? 9999) || a.name.localeCompare(b.name,"vi"));
    return sendJson(res, 200, list);
  }
  if (req.method === "POST" && pathname === "/api/customers") {
    const body = await readJsonBody(req); const name = String(body.name || "").trim(); if (!name) bad("Tên khách hàng không được để trống.");
    const result = await updateStore(data => {
      if (data.customers.some(c => c.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) bad("Khách hàng này đã có trong danh sách.");
      const customer = { id:newId(), name, group:String(body.group||"").trim(), phone:String(body.phone||"").trim(), note:String(body.note||"").trim(), active:true, sortOrder:data.customers.length+1, createdAt:new Date().toISOString() };
      data.customers.push(customer);
      const openingDebt = money(body.openingDebt);
      if (openingDebt > 0) data.debts.push({ id:newId(), customerId:customer.id, customer:name, amount:openingDebt, paid:0, balance:openingDebt, note:String(body.debtNote||"Nợ đầu kỳ").trim(), createdAt:new Date().toISOString(), payments:[], kind:"opening" });
      return customer;
    });
    return sendJson(res, 201, result);
  }
  const customerParams = routeMatch(pathname, "/api/customers/:id");
  if (req.method === "PATCH" && customerParams) {
    const body = await readJsonBody(req);
    const customer = await updateStore(data => {
      const item=data.customers.find(c=>c.id===customerParams.id); if(!item) return null;
      for(const key of ["name","group","phone","note"]) if(body[key]!==undefined) item[key]=String(body[key]).trim();
      if(body.active!==undefined) item.active=Boolean(body.active);
      for(const debt of data.debts.filter(d=>d.customerId===item.id)) debt.customer=item.name;
      return item;
    });
    if(!customer) return sendJson(res,404,{error:"Không tìm thấy khách hàng."});
    return sendJson(res,200,customer);
  }
  const customerDebtParams = routeMatch(pathname, "/api/customers/:id/debts");
  if (req.method === "POST" && customerDebtParams) {
    const body=await readJsonBody(req); const amount=money(body.amount); if(amount<=0) bad("Số tiền nợ phải lớn hơn 0.");
    const debt=await updateStore(data=>{const c=data.customers.find(x=>x.id===customerDebtParams.id); if(!c)return null; const item={id:newId(),customerId:c.id,customer:c.name,amount,paid:0,balance:amount,note:String(body.note||"Nợ phát sinh").trim(),createdAt:body.date?isoAtNoon(String(body.date)):new Date().toISOString(),payments:[],kind:"manual"};data.debts.push(item);return item;});
    if(!debt)return sendJson(res,404,{error:"Không tìm thấy khách hàng."}); return sendJson(res,201,debt);
  }
  const customerPayParams = routeMatch(pathname, "/api/customers/:id/payments");
  if (req.method === "POST" && customerPayParams) {
    const body=await readJsonBody(req); const amount=money(body.amount); if(amount<=0) bad("Số tiền trả phải lớn hơn 0.");
    const result=await updateStore(data=>{const c=data.customers.find(x=>x.id===customerPayParams.id);if(!c)return null;const selectedDebt=body.debtId?data.debts.find(d=>d.id===body.debtId&&d.customerId===c.id):null;const balance=selectedDebt?.balance??customerDebtBalance(data,c.id);if(balance<=0)bad("Khách hàng này không còn nợ.");return applyCustomerPayment(data,c.id,Math.min(amount,balance),body.note,body.debtId);});
    if(!result)return sendJson(res,404,{error:"Không tìm thấy khách hàng."}); return sendJson(res,200,result);
  }
  if (req.method === "GET" && pathname === "/api/debts") {
    const data=await readStore(); const customerId=searchParams.get("customerId");
    const debts=data.debts.filter(d=>!customerId||d.customerId===customerId).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return sendJson(res,200,debts);
  }
  const debtParams = routeMatch(pathname, "/api/debts/:id");
  if (req.method === "PATCH" && debtParams) {
    const body = await readJsonBody(req);
    const debt = await updateStore(data => {
      const item = data.debts.find(d => d.id === debtParams.id);
      if (!item) return null;
      if (body.amount !== undefined) {
        const nextAmount = money(body.amount);
        if (nextAmount <= 0) bad("Số tiền nợ phải lớn hơn 0.");
        if (nextAmount < item.paid) bad(`Khoản nợ đã trả ${formatMoney(item.paid)}, không thể giảm tổng nợ thấp hơn số đã trả.`);
        item.amount = nextAmount;
        item.balance = nextAmount - item.paid;
      }
      if (body.note !== undefined) item.note = String(body.note || "").trim();
      if (body.date !== undefined) {
        const date = String(body.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad("Ngày ghi nợ không hợp lệ.");
        item.createdAt = isoAtNoon(date);
      }
      return item;
    });
    if (!debt) return sendJson(res, 404, { error: "Không tìm thấy khoản nợ." });
    return sendJson(res, 200, debt);
  }
  if (req.method === "DELETE" && debtParams) {
    const deleted = await updateStore(data => {
      const index = data.debts.findIndex(d => d.id === debtParams.id);
      if (index < 0) return null;
      const item = data.debts.splice(index, 1)[0];
      if (item.saleId) {
        const sale = data.sales.find(s => s.id === item.saleId);
        if (sale) {
          sale.paymentMethod = "cash";
          sale.customerId = "";
          sale.customer = "";
        }
      }
      return item;
    });
    if (!deleted) return sendJson(res, 404, { error: "Không tìm thấy khoản nợ." });
    return sendJson(res, 200, { ok: true, deleted });
  }

  if (req.method === "POST" && pathname === "/api/sales") {
    const body=await readJsonBody(req); const items=body.items; const paymentMethod=body.paymentMethod||"cash";
    if(!Array.isArray(items)||!items.length)bad("Đơn hàng chưa có sản phẩm."); if(!["cash","transfer","debt"].includes(paymentMethod))bad("Phương thức thanh toán không hợp lệ.");
    const sale=await updateStore(data=>{
      const customer=paymentMethod==="debt"?data.customers.find(c=>c.id===body.customerId):null; if(paymentMethod==="debt"&&!customer)bad("Hãy chọn khách hàng ghi nợ.");
      const normalized=items.map(line=>{const product=data.products.find(p=>p.id===line.productId&&p.active!==false);const quantity=qty(line.quantity);if(!product)bad("Có sản phẩm không tồn tại.");if(quantity<=0)bad(`Số lượng ${product.name} phải lớn hơn 0.`);if(product.trackStock!==false&&product.stock<quantity)bad(`${product.name} chỉ còn ${product.stock} ${product.unit}.`);return{product,quantity};});
      const saleItems=normalized.map(({product,quantity})=>{if(product.trackStock!==false)product.stock-=quantity;return{productId:product.id,name:product.name,category:product.category,unit:product.unit,quantity,unitPrice:product.salePrice,costPrice:product.costPrice,subtotal:product.salePrice*quantity};});
      const total=saleItems.reduce((s,x)=>s+x.subtotal,0),costTotal=saleItems.reduce((s,x)=>s+x.costPrice*x.quantity,0),createdAt=body.date?isoAtNoon(String(body.date)):new Date().toISOString();
      const record={id:newId(),createdAt,items:saleItems,total,costTotal,profit:total-costTotal,paymentMethod,customerId:customer?.id||"",customer:customer?.name||"",note:String(body.note||"").trim(),source:"pos"};data.sales.push(record);
      if(paymentMethod==="debt")data.debts.push({id:newId(),saleId:record.id,customerId:customer.id,customer:customer.name,amount:total,paid:0,balance:total,note:record.note||saleItems.map(x=>`${x.name} x${x.quantity}`).join(", "),createdAt,payments:[],kind:"sale"});
      return record;
    }); return sendJson(res,201,sale);
  }
  if(req.method==="GET"&&pathname==="/api/sales"){const data=await readStore();const limit=Math.min(Math.max(Number(searchParams.get("limit"))||100,1),1000);return sendJson(res,200,data.sales.slice(-limit).reverse());}
  const saleParams = routeMatch(pathname, "/api/sales/:id");
  if (req.method === "PATCH" && saleParams) {
    const body = await readJsonBody(req);
    const items = body.items;
    const paymentMethod = body.paymentMethod || "cash";
    if (!Array.isArray(items) || !items.length) bad("Đơn hàng chưa có sản phẩm.");
    if (!["cash", "transfer", "debt"].includes(paymentMethod)) bad("Phương thức thanh toán không hợp lệ.");
    const sale = await updateStore(data => {
      const record = data.sales.find(s => s.id === saleParams.id);
      if (!record) return null;
      if (record.source !== "pos") bad("Chỉ có thể chỉnh sửa đơn bán hàng trực tiếp.");
      const oldDebt = data.debts.find(d => d.saleId === record.id);
      if (oldDebt?.paid > 0 && paymentMethod !== "debt") bad("Đơn ghi nợ đã có khoản thanh toán, không thể đổi sang hình thức khác.");

      for (const line of record.items) {
        const product = data.products.find(p => p.id === line.productId);
        if (product?.trackStock !== false) product.stock += Number(line.quantity) || 0;
      }
      const normalized = items.map(line => {
        const product = data.products.find(p => p.id === line.productId && p.active !== false);
        const quantity = qty(line.quantity);
        if (!product) bad("Có sản phẩm không tồn tại hoặc đã bị xóa.");
        if (quantity <= 0) bad(`Số lượng ${product.name} phải lớn hơn 0.`);
        if (product.trackStock !== false && product.stock < quantity) bad(`${product.name} chỉ còn ${product.stock} ${product.unit}.`);
        return { product, quantity };
      });
      const saleItems = normalized.map(({ product, quantity }) => {
        if (product.trackStock !== false) product.stock -= quantity;
        return { productId: product.id, name: product.name, category: product.category, unit: product.unit, quantity, unitPrice: product.salePrice, costPrice: product.costPrice, subtotal: product.salePrice * quantity };
      });
      const customer = paymentMethod === "debt" ? data.customers.find(c => c.id === body.customerId) : null;
      if (paymentMethod === "debt" && !customer) bad("Hãy chọn khách hàng ghi nợ.");
      const total = saleItems.reduce((sum, x) => sum + x.subtotal, 0);
      const costTotal = saleItems.reduce((sum, x) => sum + x.costPrice * x.quantity, 0);
      if (oldDebt?.paid > total) bad(`Đơn đã được trả ${formatMoney(oldDebt.paid)}, tổng mới không thể thấp hơn số đã trả.`);
      if (oldDebt?.paid > 0 && customer && customer.id !== oldDebt.customerId) bad("Đơn đã có khoản thanh toán, không thể chuyển sang khách hàng khác.");

      record.items = saleItems;
      record.total = total;
      record.costTotal = costTotal;
      record.profit = total - costTotal;
      record.paymentMethod = paymentMethod;
      record.customerId = customer?.id || "";
      record.customer = customer?.name || "";
      record.note = String(body.note || "").trim();
      if (body.date !== undefined) {
        const date = String(body.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad("Ngày bán hàng không hợp lệ.");
        record.createdAt = isoAtNoon(date);
      }

      if (paymentMethod === "debt") {
        const debt = oldDebt || { id: newId(), saleId: record.id, paid: 0, payments: [], kind: "sale" };
        debt.customerId = customer.id;
        debt.customer = customer.name;
        debt.amount = total;
        debt.balance = total - debt.paid;
        debt.note = record.note || saleItems.map(x => `${x.name} x${x.quantity}`).join(", ");
        debt.createdAt = record.createdAt;
        if (!oldDebt) data.debts.push(debt);
      } else if (oldDebt) {
        data.debts.splice(data.debts.indexOf(oldDebt), 1);
      }
      return record;
    });
    if (!sale) return sendJson(res, 404, { error: "Không tìm thấy đơn hàng." });
    return sendJson(res, 200, sale);
  }
  if (req.method === "DELETE" && saleParams) {
    const deleted = await updateStore(data => {
      const index = data.sales.findIndex(s => s.id === saleParams.id);
      if (index < 0) return null;
      const record = data.sales[index];
      if (record.source !== "pos") bad("Chỉ có thể xóa đơn bán hàng trực tiếp.");
      const debt = data.debts.find(d => d.saleId === record.id);
      if (debt?.paid > 0) bad("Đơn ghi nợ đã có khoản thanh toán nên không thể xóa.");
      for (const line of record.items) {
        const product = data.products.find(p => p.id === line.productId);
        if (product?.trackStock !== false) product.stock += Number(line.quantity) || 0;
      }
      if (debt) data.debts.splice(data.debts.indexOf(debt), 1);
      data.sales.splice(index, 1);
      return record;
    });
    if (!deleted) return sendJson(res, 404, { error: "Không tìm thấy đơn hàng." });
    return sendJson(res, 200, { ok: true, deleted });
  }

  if(req.method==="GET"&&pathname==="/api/weekly-inventory/template"){
    const data=await readStore(); const products=data.products.filter(p=>p.active!==false&&p.trackStock!==false&&p.revenueMode==="weekly_inventory");
    const latestByProduct=new Map(); for(const audit of data.weeklyAudits.slice().sort((a,b)=>a.weekEnd.localeCompare(b.weekEnd)))for(const line of audit.lines)latestByProduct.set(line.productId,line.endingStock);
    return sendJson(res,200,products.map(p=>({...p,openingStock:latestByProduct.has(p.id)?latestByProduct.get(p.id):p.initialStock})));
  }
  if(req.method==="GET"&&pathname==="/api/weekly-inventory"){
    const data=await readStore(); return sendJson(res,200,data.weeklyAudits.slice().sort((a,b)=>b.weekEnd.localeCompare(a.weekEnd)));
  }
  if (req.method === "POST" && pathname === "/api/weekly-inventory") {
    const body = await readJsonBody(req), weekStart = String(body.weekStart || ""), weekEnd = String(body.weekEnd || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd) || weekEnd < weekStart) bad("Khoảng ngày kiểm kho không hợp lệ.");
    if (!Array.isArray(body.lines) || !body.lines.length) bad("Chưa có dữ liệu kiểm kho.");
    const audit = await updateStore(data => {
      if (data.weeklyAudits.some(a => a.weekStart === weekStart && a.weekEnd === weekEnd)) bad("Tuần này đã được chốt kiểm kho.");
      const auditId = newId(), saleItems = [], lines = [];
      for (const input of body.lines) {
        const p = data.products.find(x => x.id === input.productId);
        if (!p || p.revenueMode !== "weekly_inventory") continue;
        const openingStock = qty(input.openingStock), receivedCases = qty(input.receivedCases), receivedUnits = qty(input.receivedUnits);
        const receivedQty = receivedCases * p.packSize + receivedUnits, endingStock = qty(input.endingStock);
        const soldQty = openingStock + receivedQty - endingStock;
        if (soldQty < 0) bad(`${p.name}: tồn cuối lớn hơn tồn đầu + nhập thêm.`);
        const recordedQty = data.sales.filter(s => s.source !== "weekly_inventory" && inDateRange(s.createdAt, weekStart, weekEnd)).flatMap(s => s.items).filter(x => x.productId === p.id).reduce((sum, x) => sum + x.quantity, 0);
        const adjustmentQty = soldQty - recordedQty;
        if (adjustmentQty < 0) bad(`${p.name}: số đã bán trong app (${recordedQty}) lớn hơn số bán theo kiểm kho (${soldQty}). Hãy kiểm tra lại tồn cuối.`);
        if (adjustmentQty > 0) saleItems.push({ productId:p.id, name:p.name, category:p.category, unit:p.unit, quantity:adjustmentQty, unitPrice:p.salePrice, costPrice:p.costPrice, subtotal:p.salePrice*adjustmentQty });
        const stockBefore = p.stock;
        p.stock = endingStock;
        lines.push({ productId:p.id, name:p.name, unit:p.unit, packSize:p.packSize, stockBefore, openingStock, receivedCases, receivedUnits, receivedQty, endingStock, soldQty, recordedQty, adjustmentQty, revenue:soldQty*p.salePrice, cost:soldQty*p.costPrice, profit:soldQty*(p.salePrice-p.costPrice) });
      }
      let saleId = "";
      if (saleItems.length) {
        const total = saleItems.reduce((s,x)=>s+x.subtotal,0), costTotal = saleItems.reduce((s,x)=>s+x.costPrice*x.quantity,0);
        saleId = newId();
        data.sales.push({ id:saleId, createdAt:isoAtNoon(weekEnd), items:saleItems, total, costTotal, profit:total-costTotal, paymentMethod:"inventory", customerId:"", customer:"", note:`Doanh thu tự tính từ kiểm kho ${weekStart} đến ${weekEnd}`, source:"weekly_inventory", weeklyAuditId:auditId });
      }
      const record = { id:auditId, weekStart, weekEnd, createdAt:new Date().toISOString(), note:String(body.note||"").trim(), lines, totalSold:lines.reduce((s,x)=>s+x.soldQty,0), totalRevenue:lines.reduce((s,x)=>s+x.revenue,0), totalCost:lines.reduce((s,x)=>s+x.cost,0), totalProfit:lines.reduce((s,x)=>s+x.profit,0), adjustmentSaleId:saleId };
      data.weeklyAudits.push(record);
      return record;
    });
    return sendJson(res, 201, audit);
  }
  const weeklyParams = routeMatch(pathname, "/api/weekly-inventory/:id");
  if (req.method === "PATCH" && weeklyParams) {
    const body = await readJsonBody(req);
    const weekStart = String(body.weekStart || ""), weekEnd = String(body.weekEnd || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd) || weekEnd < weekStart) bad("Khoảng ngày kiểm kho không hợp lệ.");
    if (!Array.isArray(body.lines) || !body.lines.length) bad("Chưa có dữ liệu kiểm kho.");
    const audit = await updateStore(data => {
      const record = data.weeklyAudits.find(a => a.id === weeklyParams.id);
      if (!record) return null;
      const latest = data.weeklyAudits.slice().sort((a, b) => b.weekEnd.localeCompare(a.weekEnd) || b.createdAt.localeCompare(a.createdAt))[0];
      if (latest?.id !== record.id) bad("Chỉ có thể chỉnh sửa lần kiểm kho mới nhất để bảo toàn số tồn kho hiện tại.");
      if (data.weeklyAudits.some(a => a.id !== record.id && a.weekStart === weekStart && a.weekEnd === weekEnd)) bad("Khoảng ngày này đã có một đơn kiểm kho khác.");

      if (record.adjustmentSaleId) data.sales = data.sales.filter(s => s.id !== record.adjustmentSaleId);
      const oldLines = new Map(record.lines.map(line => [line.productId, line]));
      const lines = [], saleItems = [];
      for (const input of body.lines) {
        const p = data.products.find(x => x.id === input.productId);
        if (!p || p.revenueMode !== "weekly_inventory") continue;
        const openingStock = qty(input.openingStock), receivedCases = qty(input.receivedCases), receivedUnits = qty(input.receivedUnits);
        const receivedQty = receivedCases * p.packSize + receivedUnits, endingStock = qty(input.endingStock);
        const soldQty = openingStock + receivedQty - endingStock;
        if (soldQty < 0) bad(`${p.name}: tồn cuối lớn hơn tồn đầu + nhập thêm.`);
        const recordedQty = data.sales.filter(s => s.source !== "weekly_inventory" && inDateRange(s.createdAt, weekStart, weekEnd)).flatMap(s => s.items).filter(x => x.productId === p.id).reduce((sum, x) => sum + x.quantity, 0);
        const adjustmentQty = soldQty - recordedQty;
        if (adjustmentQty < 0) bad(`${p.name}: số đã bán trong app (${recordedQty}) lớn hơn số bán theo kiểm kho (${soldQty}). Hãy kiểm tra lại tồn cuối.`);
        if (adjustmentQty > 0) saleItems.push({ productId:p.id, name:p.name, category:p.category, unit:p.unit, quantity:adjustmentQty, unitPrice:p.salePrice, costPrice:p.costPrice, subtotal:p.salePrice*adjustmentQty });
        const previousLine = oldLines.get(p.id);
        const stockBefore = Number(previousLine?.stockBefore ?? previousLine?.openingStock ?? p.stock) || 0;
        lines.push({ productId:p.id, name:p.name, unit:p.unit, packSize:p.packSize, stockBefore, openingStock, receivedCases, receivedUnits, receivedQty, endingStock, soldQty, recordedQty, adjustmentQty, revenue:soldQty*p.salePrice, cost:soldQty*p.costPrice, profit:soldQty*(p.salePrice-p.costPrice) });
      }
      if (!lines.length) bad("Không còn mặt hàng hợp lệ trong đơn kiểm kho.");

      const newLines = new Map(lines.map(line => [line.productId, line]));
      for (const productId of new Set([...oldLines.keys(), ...newLines.keys()])) {
        const p = data.products.find(x => x.id === productId);
        if (!p) continue;
        const oldLine = oldLines.get(productId), newLine = newLines.get(productId);
        if (oldLine && newLine) p.stock = Math.max(0, p.stock + newLine.endingStock - oldLine.endingStock);
        else if (oldLine) p.stock = Math.max(0, p.stock + (Number(oldLine.stockBefore ?? oldLine.openingStock) || 0) - oldLine.endingStock);
        else if (newLine) p.stock = newLine.endingStock;
      }

      let saleId = "";
      if (saleItems.length) {
        const total = saleItems.reduce((s,x)=>s+x.subtotal,0), costTotal = saleItems.reduce((s,x)=>s+x.costPrice*x.quantity,0);
        saleId = newId();
        data.sales.push({ id:saleId, createdAt:isoAtNoon(weekEnd), items:saleItems, total, costTotal, profit:total-costTotal, paymentMethod:"inventory", customerId:"", customer:"", note:`Doanh thu tự tính từ kiểm kho ${weekStart} đến ${weekEnd}`, source:"weekly_inventory", weeklyAuditId:record.id });
      }
      Object.assign(record, { weekStart, weekEnd, note:String(body.note||"").trim(), lines, totalSold:lines.reduce((s,x)=>s+x.soldQty,0), totalRevenue:lines.reduce((s,x)=>s+x.revenue,0), totalCost:lines.reduce((s,x)=>s+x.cost,0), totalProfit:lines.reduce((s,x)=>s+x.profit,0), adjustmentSaleId:saleId, updatedAt:new Date().toISOString() });
      return record;
    });
    if (!audit) return sendJson(res, 404, { error: "Không tìm thấy đơn kiểm kho." });
    return sendJson(res, 200, audit);
  }
  if (req.method === "DELETE" && weeklyParams) {
    const deleted = await updateStore(data => {
      const index = data.weeklyAudits.findIndex(a => a.id === weeklyParams.id);
      if (index < 0) return null;
      const record = data.weeklyAudits[index];
      const latest = data.weeklyAudits.slice().sort((a, b) => b.weekEnd.localeCompare(a.weekEnd) || b.createdAt.localeCompare(a.createdAt))[0];
      if (latest?.id !== record.id) bad("Chỉ có thể xóa lần kiểm kho mới nhất để bảo toàn số tồn kho hiện tại.");
      if (record.adjustmentSaleId) data.sales = data.sales.filter(s => s.id !== record.adjustmentSaleId);
      for (const line of record.lines) {
        const p = data.products.find(x => x.id === line.productId);
        if (p) {
          const rollback = line.stockBefore !== undefined ? Number(line.stockBefore) - Number(line.endingStock) : Number(line.adjustmentQty) || 0;
          p.stock = Math.max(0, p.stock + rollback);
        }
      }
      data.weeklyAudits.splice(index, 1);
      return record;
    });
    if (!deleted) return sendJson(res, 404, { error: "Không tìm thấy đơn kiểm kho." });
    return sendJson(res, 200, { ok: true, deleted });
  }

  if(req.method==="POST"&&pathname==="/api/ai/chat") {
    const body = await readJsonBody(req);
    const message = String(body.message || "").trim();
    if (!message) bad("Bạn chưa nhập câu hỏi.");
    const data = await readStore();
    const localAnswer = localAssistant(data, message);
    if (!process.env.OPENAI_API_KEY) return sendJson(res, 200, { answer: localAnswer, mode: "local" });

    const context = {
      generatedAt: new Date().toISOString(),
      products: data.products,
      customers: data.customers.map(c => ({ ...c, debtBalance: customerDebtBalance(data, c.id) })),
      recentSales: data.sales.slice(-150),
      openDebts: data.debts.filter(d => d.balance > 0),
      weeklyAudits: data.weeklyAudits.slice(-12)
    };
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5-mini",
          instructions: "Bạn là trợ lý quản lý căn tin. Chỉ dựa vào JSON dữ liệu được cung cấp. Trả lời tiếng Việt, tính toán rõ ràng, không tự bịa. Số tiền trình bày theo đồng Việt Nam.",
          input: `DỮ LIỆU CĂN TIN:\n${JSON.stringify(context)}\n\nCÂU HỎI: ${message}`
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "OpenAI API trả lỗi.");
      const answer = result.output_text || result.output?.flatMap(x => x.content || []).map(x => x.text || "").join("\n") || localAnswer;
      return sendJson(res, 200, { answer, mode: "openai" });
    } catch (error) {
      console.warn("OpenAI không khả dụng, chuyển sang trợ lý miễn phí:", error.message);
      return sendJson(res, 200, { answer: `${localAnswer}\n\n(Ghi chú: OpenAI đang không khả dụng nên app đã dùng trợ lý miễn phí tích hợp.)`, mode: "local-fallback" });
    }
  }

  if(req.method==="GET"&&pathname==="/api/export/backup.json") {
    const data = await readStore();
    const body = JSON.stringify(data, null, 2);
    return sendText(res, 200, body, "application/json; charset=utf-8", { "Content-Disposition": `attachment; filename="cantin-backup-${todayKey()}.json"` });
  }

  if(req.method==="GET"&&pathname==="/api/export/sales.csv"){
    const data=await readStore();const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;const rows=[["Thời gian","Nguồn","Thanh toán","Khách hàng","Sản phẩm","Tổng tiền","Giá vốn","Lợi nhuận","Ghi chú"]];for(const sale of data.sales)rows.push([sale.createdAt,sale.source||"pos",sale.paymentMethod,sale.customer,sale.items.map(x=>`${x.name} x${x.quantity}`).join("; "),sale.total,sale.costTotal,sale.profit,sale.note]);const csv="\uFEFF"+rows.map(r=>r.map(esc).join(",")).join("\r\n");return sendText(res,200,csv,"text/csv; charset=utf-8",{"Content-Disposition":'attachment; filename="bao-cao-ban-hang.csv"'});
  }

  return sendJson(res,404,{error:"Không tìm thấy API."});
}

const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".webmanifest":"application/manifest+json; charset=utf-8"};
async function serveStatic(req,res,url){let pathname=decodeURIComponent(url.pathname);if(pathname==="/")pathname="/index.html";const filePath=path.normalize(path.join(publicDir,pathname));if(!filePath.startsWith(publicDir))return sendText(res,403,"Forbidden");try{const body=await fs.readFile(filePath);return sendText(res,200,body,mime[path.extname(filePath)]||"application/octet-stream",{"Cache-Control":"no-cache"});}catch{return sendText(res,404,"Không tìm thấy trang.");}}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);if(url.pathname.startsWith("/api/"))return await handleApi(req,res,url);return await serveStatic(req,res,url);}catch(error){console.error(error);return sendJson(res,error.status||500,{error:error.message||"Lỗi máy chủ."});}});
server.listen(port,"0.0.0.0",()=>console.log(`Căn tin AI v2.1 Standalone đang chạy tại http://localhost:${port}`));
