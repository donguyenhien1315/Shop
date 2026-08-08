
const process = { env: {} };
const appPin = "supabase";
const money = value => Math.round(Number(value) || 0);
const qty = value => Math.max(0, Number(value) || 0);
const dateKey = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const todayKey = () => dateKey(new Date().toISOString());
const monthKey = iso => dateKey(iso).slice(0, 7);
function sendJson(res, status, payload) { res.status=status; res.headers["Content-Type"]="application/json; charset=utf-8"; res.headers["Cache-Control"]="no-store"; res.body=JSON.stringify(payload); }
function sendText(res, status, body, contentType="text/plain; charset=utf-8", extraHeaders={}) { res.status=status; res.headers["Content-Type"]=contentType; Object.assign(res.headers, extraHeaders); res.body=String(body); }
async function readJsonBody(req) { const text=await req._request.text(); if (!text) return {}; try { return JSON.parse(text); } catch { throw Object.assign(new Error("Dữ liệu JSON không hợp lệ."), {status:400}); } }
function routeMatch(pathname, pattern) { const a=pathname.split("/").filter(Boolean), b=pattern.split("/").filter(Boolean); if(a.length!==b.length)return null; const params={}; for(let i=0;i<b.length;i++){ if(b[i].startsWith(":")) params[b[i].slice(1)]=decodeURIComponent(a[i]); else if(a[i]!==b[i])return null; } return params; }
function bad(message){ throw Object.assign(new Error(message),{status:400}); }
function isoAtNoon(date){ return `${date}T05:00:00.000Z`; }
function inDateRange(iso,start,end){ const key=dateKey(iso); return key>=start&&key<=end; }
function customerDebtBalance(data,customerId){ return data.debts.filter(d=>d.customerId===customerId).reduce((sum,d)=>sum+d.balance,0); }
function normalizeText(value){ return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function formatMoney(value){ return `${money(value).toLocaleString("vi-VN")} ₫`; }
function safeEqualText(a,b){ return String(a||"")===String(b||""); }
function isAuthenticated(req){ return Boolean(req.authenticated); }
function authCookie(){ return ""; }
function sessionToken(){ return ""; }
function getStorageMode(){ return "supabase"; }
function newId(){ return crypto.randomUUID(); }
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


function emptyStore(name="Cửa hàng mới") {
  return { products:[], customers:[], debts:[], sales:[], weeklyTemplate:[], weeklyAudits:[], stockAdjustments:[], meta:{ name, createdAt:new Date().toISOString() } };
}
function ensureStoreShape(data, name="Cửa hàng") {
  const shaped = data && typeof data === "object" ? data : {};
  for (const key of ["products","customers","debts","sales","weeklyTemplate","weeklyAudits","stockAdjustments"]) if (!Array.isArray(shaped[key])) shaped[key]=[];
  shaped.meta = shaped.meta && typeof shaped.meta === "object" ? shaped.meta : {name};
  if (!shaped.meta.name) shaped.meta.name=name;
  return shaped;
}
function normalizeRoot(raw) {
  if (raw && raw.__multiStore === true && Array.isArray(raw.stores)) {
    raw.stores = raw.stores.map(s => ({ id:s.id||newId(), name:String(s.name||"Cửa hàng").trim()||"Cửa hàng", createdAt:s.createdAt||new Date().toISOString(), data:ensureStoreShape(s.data, s.name) }));
    if (!raw.stores.length) raw.stores.push({id:newId(),name:"Cửa hàng chính",createdAt:new Date().toISOString(),data:emptyStore("Cửa hàng chính")});
    if (!raw.stores.some(s=>s.id===raw.activeStoreId)) raw.activeStoreId=raw.stores[0].id;
    return raw;
  }
  const first = ensureStoreShape(raw ? structuredClone(raw) : structuredClone(DEFAULT_STORE), "Cửa hàng chính");
  const id = newId();
  return { __multiStore:true, version:1, activeStoreId:id, stores:[{id,name:first.meta?.name||"Cửa hàng chính",createdAt:new Date().toISOString(),data:first}] };
}
function activeStore(root){ return root.stores.find(s=>s.id===root.activeStoreId) || root.stores[0]; }

const CANONICAL_DEBT_SYNC_VERSION = "source-cantin-v2-2026-08-08";
function syncCanonicalDebtData(root) {
  const store = activeStore(root);
  if (!store || !store.data) return false;
  store.data.meta = store.data.meta && typeof store.data.meta === "object" ? store.data.meta : {};
  if (store.data.meta.canonicalDebtSyncVersion === CANONICAL_DEBT_SYNC_VERSION) return false;
  // Đồng bộ đúng dữ liệu khách hàng + công nợ từ bộ nguồn Cantin AI v2 / Sổ nợ.xlsm.
  // Không thay đổi sản phẩm, tồn kho, bán hàng, kiểm kho hoặc điều chỉnh kho hiện có.
  store.data.customers = structuredClone(DEFAULT_STORE.customers || []);
  store.data.debts = structuredClone(DEFAULT_STORE.debts || []);
  store.data.meta.canonicalDebtSyncVersion = CANONICAL_DEBT_SYNC_VERSION;
  store.data.meta.canonicalDebtSyncAt = new Date().toISOString();
  store.data.meta.canonicalDebtSource = "Cantin AI v2 / Sổ nợ.xlsm";
  return true;
}
function parseNumberFromText(text){
  const m=String(text||"").replace(/\./g,"").replace(/,/g,"").match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  return m ? Number(m[1]) : null;
}
function findProductFlexible(products, message){
  const q=normalizeText(message); let best=null, score=0;
  for(const p of products.filter(x=>x.active!==false)){
    const n=normalizeText(p.name); if(!n) continue;
    if(q.includes(n) && n.length>score){best=p;score=n.length;continue;}
    const words=n.split(" ").filter(w=>w.length>=3); const hits=words.filter(w=>q.includes(w)).length;
    const s=hits*10 + words.reduce((a,w)=>a+(q.includes(w)?w.length:0),0);
    if(hits && s>score){best=p;score=s;}
  }
  return best;
}
function inventoryCommand(data,message){
  const q=normalizeText(message); const product=findProductFlexible(data.products,message); if(!product) return null;
  const isImport=q.includes("nhap kho")||q.startsWith("nhap ")||q.includes(" nhap ");
  const isExport=q.includes("xuat kho")||q.startsWith("xuat ")||q.includes(" xuat ");
  const soldOut=q.includes("ban het")||q.includes("het hang")||q.includes("het roi");
  const hasNumber=/\b\d+(?:[.,]\d+)?\b/.test(q); const isQuestion=q.includes("bao nhieu")||q.includes("may chai")||q.includes("may lon"); const isCheck=q.includes("kiem kho")||soldOut||((q.includes("con lai")||q.includes(" con "))&&hasNumber&&!isQuestion);
  if(!isImport&&!isExport&&!isCheck) return null;
  const before=Number(product.stock)||0; let amount=parseNumberFromText(q); let after=before; let action="";
  if(isImport){ if(amount===null) return {error:`Hãy cho biết số lượng cần nhập cho ${product.name}.`}; if(q.includes("thung")) amount*=Math.max(1,Number(product.packSize)||1); after=before+amount; action="Nhập kho"; }
  else if(isExport){ if(amount===null) return {error:`Hãy cho biết số lượng cần xuất cho ${product.name}.`}; after=Math.max(0,before-amount); action="Xuất kho"; }
  else { if(soldOut) amount=0; if(amount===null) return {error:`Hãy cho biết tồn thực tế của ${product.name}.`}; after=Math.max(0,amount); action="Kiểm kho nhanh"; }
  product.stock=after;
  const delta=after-before;
  const rec={id:newId(),productId:product.id,productName:product.name,before,after,delta,action,message,createdAt:new Date().toISOString()};
  data.stockAdjustments=data.stockAdjustments||[]; data.stockAdjustments.push(rec);
  let auditId="";
  if(isCheck||soldOut){
    const now=new Date(), key=now.toISOString().slice(0,10), sold=Math.max(0,before-after);
    let saleId="";
    if(sold>0){
      const total=sold*(Number(product.salePrice)||0), costTotal=sold*(Number(product.costPrice)||0);
      saleId=newId();
      data.sales.push({id:saleId,createdAt:now.toISOString(),items:[{productId:product.id,name:product.name,category:product.category,unit:product.unit,quantity:sold,unitPrice:product.salePrice,costPrice:product.costPrice,subtotal:total}],total,costTotal,profit:total-costTotal,paymentMethod:"inventory",customerId:"",customer:"",note:`AI kiểm kho: ${message}`,source:"weekly_inventory"});
    }
    auditId=newId();
    data.weeklyAudits=data.weeklyAudits||[];
    data.weeklyAudits.push({id:auditId,weekStart:key,weekEnd:key,createdAt:now.toISOString(),note:`AI: ${message}`,lines:[{productId:product.id,name:product.name,unit:product.unit,packSize:product.packSize||1,stockBefore:before,openingStock:before,receivedCases:0,receivedUnits:0,receivedQty:0,endingStock:after,soldQty:sold,recordedQty:0,adjustmentQty:sold,revenue:sold*(Number(product.salePrice)||0),cost:sold*(Number(product.costPrice)||0),profit:sold*((Number(product.salePrice)||0)-(Number(product.costPrice)||0))}],totalSold:sold,totalRevenue:sold*(Number(product.salePrice)||0),totalCost:sold*(Number(product.costPrice)||0),totalProfit:sold*((Number(product.salePrice)||0)-(Number(product.costPrice)||0)),adjustmentSaleId:saleId,source:"ai_inventory"});
  }
  return {action,product,before,after,delta,auditId,answer:`${action} ${product.name}: ${before.toLocaleString("vi-VN")} → ${after.toLocaleString("vi-VN")} ${product.unit||""}. Đã cập nhật tồn kho${(isCheck||soldOut)?" và tạo đơn kiểm kho lúc "+new Date().toLocaleString("vi-VN"):""}.`};
}


const SUPABASE_URL = "https://kqfqdxmhrsndrgyipybe.supabase.co";
const SUPABASE_KEY = "sb_publishable_vLPh3dz8y3jHDcXtg1JmgQ_nJF2WdUF";
const DEFAULT_STORE = {"products":[{"id":"cf-ca-phe-sua","name":"Cà phê sữa","category":"Cà phê","unit":"ly","costPrice":3963,"salePrice":15000,"stock":0,"minStock":0,"trackStock":false,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"40ml cà phê phin + 20ml sữa đặc","formula":"40ml cà phê phin + 20ml sữa đặc","note":"","active":true,"initialStock":0},{"id":"cf-bac-xiu","name":"Bạc xỉu","category":"Cà phê","unit":"ly","costPrice":4619,"salePrice":20000,"stock":0,"minStock":0,"trackStock":false,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"30ml cà phê + 40ml sữa tươi + 20ml sữa đặc","formula":"30ml cà phê + 40ml sữa tươi + 20ml sữa đặc","note":"","active":true,"initialStock":0},{"id":"cf-sua-sai-gon","name":"Cà phê sữa Sài Gòn","category":"Cà phê","unit":"ly","costPrice":3963,"salePrice":20000,"stock":0,"minStock":0,"trackStock":false,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"Tạm dùng cùng công thức cà phê sữa","formula":"Tạm dùng cùng công thức cà phê sữa","note":"","active":true,"initialStock":0},{"id":"cf-ca-phe-muoi","name":"Cà phê muối","category":"Cà phê","unit":"ly","costPrice":8263,"salePrice":20000,"stock":0,"minStock":0,"trackStock":false,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"Công thức cho 4 ly","formula":"Công thức cho 4 ly","note":"","active":true,"initialStock":0},{"id":"cf-den-may","name":"Cà phê đen máy","category":"Cà phê","unit":"ly","costPrice":4287,"salePrice":17000,"stock":0,"minStock":0,"trackStock":false,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"18g cà phê máy + 3g đường","formula":"18g cà phê máy + 3g đường","note":"","active":true,"initialStock":0},{"id":"cf-den-phin","name":"Cà phê đen phin","category":"Cà phê","unit":"ly","costPrice":3051,"salePrice":15000,"stock":0,"minStock":0,"trackStock":false,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"40ml cà phê phin + 3g đường","formula":"40ml cà phê phin + 3g đường","note":"","active":true,"initialStock":0},{"id":"p-aquafina","name":"Aquafina 500ml","category":"Nước","unit":"chai","costPrice":3750,"salePrice":12000,"stock":72,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":90000,"revenueMode":"weekly_inventory","source":"HĐ 06/06, 26/06 và 15/07","formula":"HĐ 06/06, 26/06 và 15/07","note":"","active":true,"initialStock":72},{"id":"nuoc-revive-pet-500","name":"Revive PET 500ml","category":"Nước","unit":"chai","costPrice":7583,"salePrice":12000,"stock":120,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":182000,"revenueMode":"weekly_inventory","source":"5 thùng; giá nhập dùng HĐ mới nhất 13/07","formula":"5 thùng; giá nhập dùng HĐ mới nhất 13/07","note":"","active":true,"initialStock":120},{"id":"nuoc-revive-chanh-muoi","name":"Revive chanh muối PET","category":"Nước","unit":"chai","costPrice":6792,"salePrice":12000,"stock":96,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":163000,"revenueMode":"weekly_inventory","source":"HĐ 06/06 và 26/06","formula":"HĐ 06/06 và 26/06","note":"","active":true,"initialStock":96},{"id":"nuoc-revive-pro-450","name":"Revive Pro 450ml","category":"Nước","unit":"chai","costPrice":7083,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":170000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 13/07","formula":"Bổ sung từ HĐ 13/07","note":"","active":true,"initialStock":48},{"id":"nuoc-twister-cam-320","name":"Twister cam ép PET 320ml","category":"Nước","unit":"chai","costPrice":6792,"salePrice":12000,"stock":72,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":163000,"revenueMode":"weekly_inventory","source":"HĐ 06/06, 26/06 và 13/07","formula":"HĐ 06/06, 26/06 và 13/07","note":"","active":true,"initialStock":72},{"id":"nuoc-sting-vang-lon","name":"Sting vàng lon 320ml","category":"Nước","unit":"chai","costPrice":6929,"salePrice":12000,"stock":56,"minStock":28,"trackStock":true,"packSize":28,"purchasePrice":194000,"revenueMode":"weekly_inventory","source":"HĐ 06/06 và 26/06","formula":"HĐ 06/06 và 26/06","note":"","active":true,"initialStock":56},{"id":"nuoc-sting-dau-lon","name":"Sting dâu lon 320ml","category":"Nước","unit":"chai","costPrice":7321,"salePrice":12000,"stock":56,"minStock":28,"trackStock":true,"packSize":28,"purchasePrice":205000,"revenueMode":"weekly_inventory","source":"HĐ 06/06 và 26/06","formula":"HĐ 06/06 và 26/06","note":"","active":true,"initialStock":56},{"id":"nuoc-sting-vang-pet","name":"Sting vàng PET","category":"Nước","unit":"chai","costPrice":7583,"salePrice":12000,"stock":24,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":182000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 13/07","formula":"Bổ sung từ HĐ 13/07","note":"","active":true,"initialStock":24},{"id":"nuoc-sting-dau-pet","name":"Sting dâu PET","category":"Nước","unit":"chai","costPrice":7917,"salePrice":12000,"stock":24,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":190000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 13/07","formula":"Bổ sung từ HĐ 13/07","note":"","active":true,"initialStock":24},{"id":"nuoc-pepsi-pet-390","name":"Pepsi PET 390ml","category":"Nước","unit":"chai","costPrice":7125,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":171000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 13/07","formula":"Bổ sung từ HĐ 13/07","note":"","active":true,"initialStock":48},{"id":"nuoc-7up-pet-390","name":"7Up PET 390ml","category":"Nước","unit":"chai","costPrice":5417,"salePrice":12000,"stock":24,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":130000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 13/07","formula":"Bổ sung từ HĐ 13/07","note":"","active":true,"initialStock":24},{"id":"nuoc-sua-trai-cay-dau","name":"Sữa trái cây vị dâu","category":"Nước","unit":"chai","costPrice":7167,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":172000,"revenueMode":"weekly_inventory","source":"HĐ 06/06 và 26/06","formula":"HĐ 06/06 và 26/06","note":"","active":true,"initialStock":48},{"id":"nuoc-sua-trai-cay-cam","name":"Sữa trái cây vị cam","category":"Nước","unit":"chai","costPrice":7167,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":172000,"revenueMode":"weekly_inventory","source":"HĐ 06/06 và 26/06","formula":"HĐ 06/06 và 26/06","note":"","active":true,"initialStock":48},{"id":"nuoc-oolong-chanh-450","name":"Trà Oolong chanh 450ml","category":"Nước","unit":"chai","costPrice":7542,"salePrice":12000,"stock":72,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":181000,"revenueMode":"weekly_inventory","source":"HĐ 06/06, 26/06 và 13/07","formula":"HĐ 06/06, 26/06 và 13/07","note":"","active":true,"initialStock":72},{"id":"nuoc-rockstar-lon","name":"Nước tăng lực Rockstar lon","category":"Nước","unit":"chai","costPrice":8542,"salePrice":12000,"stock":96,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":205000,"revenueMode":"weekly_inventory","source":"HĐ 06/06 và 26/06","formula":"HĐ 06/06 và 26/06","note":"","active":true,"initialStock":96},{"id":"nuoc-247","name":"Nước 247","category":"Nước","unit":"chai","costPrice":8042,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":193000,"revenueMode":"weekly_inventory","source":"HĐ 27/05 và 15/07","formula":"HĐ 27/05 và 15/07","note":"","active":true,"initialStock":48},{"id":"nuoc-joco-vai","name":"Joco vải","category":"Nước","unit":"chai","costPrice":7833,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":188000,"revenueMode":"weekly_inventory","source":"HĐ 27/05","formula":"HĐ 27/05","note":"","active":true,"initialStock":48},{"id":"nuoc-bi-dao-lon","name":"B đào lon","category":"Nước","unit":"chai","costPrice":6167,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":148000,"revenueMode":"weekly_inventory","source":"HĐ 27/05","formula":"HĐ 27/05","note":"","active":true,"initialStock":48},{"id":"nuoc-c2-dao","name":"Trà C2 đào","category":"Nước","unit":"chai","costPrice":7625,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":183000,"revenueMode":"weekly_inventory","source":"HĐ 27/05 và 08/07; dùng giá mới nhất","formula":"HĐ 27/05 và 08/07; dùng giá mới nhất","note":"","active":true,"initialStock":48},{"id":"nuoc-bo-huc-viet","name":"Bò húc Việt","category":"Nước","unit":"chai","costPrice":9167,"salePrice":15000,"stock":72,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":220000,"revenueMode":"weekly_inventory","source":"HĐ 15/07","formula":"HĐ 15/07","note":"","active":true,"initialStock":72},{"id":"nuoc-pocari","name":"Pocari","category":"Nước","unit":"chai","costPrice":12708,"salePrice":18000,"stock":240,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":305000,"revenueMode":"weekly_inventory","source":"HĐ 27/05, 08/07 và 15/07","formula":"HĐ 27/05, 08/07 và 15/07","note":"","active":true,"initialStock":240},{"id":"nuoc-danh-thanh-lat","name":"Đảnh Thanh Lạt","category":"Nước","unit":"chai","costPrice":4208,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":101000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 27/05 và 08/07","formula":"Bổ sung từ HĐ 27/05 và 08/07","note":"","active":true,"initialStock":48},{"id":"nuoc-danh-thanh-ngot","name":"Đảnh Thanh Ngọt","category":"Nước","unit":"chai","costPrice":5750,"salePrice":12000,"stock":48,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":138000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 27/05 và 08/07; dùng giá mới nhất","formula":"Bổ sung từ HĐ 27/05 và 08/07; dùng giá mới nhất","note":"","active":true,"initialStock":48},{"id":"nuoc-dr-thanh-350","name":"Dr Thanh 350ml","category":"Nước","unit":"chai","costPrice":8667,"salePrice":12000,"stock":24,"minStock":24,"trackStock":true,"packSize":24,"purchasePrice":208000,"revenueMode":"weekly_inventory","source":"Bổ sung từ HĐ 08/07","formula":"Bổ sung từ HĐ 08/07","note":"","active":true,"initialStock":24},{"id":"banh-oishi","name":"Bánh Oishi","category":"Bánh Oishi","unit":"gói","costPrice":7400,"salePrice":12000,"stock":60,"minStock":12,"trackStock":true,"packSize":60,"purchasePrice":444000,"revenueMode":"direct_sale","source":"Người dùng cung cấp","formula":"444.000/60 gói","note":"","active":true,"initialStock":60},{"id":"banh-pillows","name":"Pillows","category":"Bánh Oishi","unit":"gói","costPrice":8000,"salePrice":15000,"stock":20,"minStock":4,"trackStock":true,"packSize":20,"purchasePrice":160000,"revenueMode":"direct_sale","source":"Người dùng cung cấp","formula":"160.000/20 gói","note":"","active":true,"initialStock":20},{"id":"kem-steen-vani-socola","name":"Merino S Teen Vani Socola","category":"Kem","unit":"cây","costPrice":10520,"salePrice":15000,"stock":25,"minStock":5,"trackStock":true,"packSize":25,"purchasePrice":263000,"revenueMode":"direct_sale","source":"HĐ 23/02","formula":"HĐ 23/02","note":"","active":true,"initialStock":25},{"id":"kem-steen-socola","name":"Merino S Teen Socola","category":"Kem","unit":"cây","costPrice":10520,"salePrice":15000,"stock":75,"minStock":5,"trackStock":true,"packSize":25,"purchasePrice":263000,"revenueMode":"direct_sale","source":"HĐ 11/06","formula":"HĐ 11/06","note":"","active":true,"initialStock":75},{"id":"kem-steen-sau-rieng","name":"Merino S Teen Sầu riêng Socola","category":"Kem","unit":"cây","costPrice":10520,"salePrice":15000,"stock":50,"minStock":5,"trackStock":true,"packSize":25,"purchasePrice":263000,"revenueMode":"direct_sale","source":"HĐ 11/06","formula":"HĐ 11/06","note":"","active":true,"initialStock":50},{"id":"kem-superteen-socola","name":"Merino Superteen Cream Socola","category":"Kem","unit":"cây","costPrice":10520,"salePrice":15000,"stock":50,"minStock":5,"trackStock":true,"packSize":25,"purchasePrice":263000,"revenueMode":"direct_sale","source":"HĐ 23/02 và 11/06","formula":"HĐ 23/02 và 11/06","note":"","active":true,"initialStock":50},{"id":"kem-yeah-cacao","name":"Merino Yeah Cacao","category":"Kem","unit":"cây","costPrice":9800,"salePrice":15000,"stock":45,"minStock":6,"trackStock":true,"packSize":30,"purchasePrice":294000,"revenueMode":"direct_sale","source":"HĐ 23/02","formula":"HĐ 23/02","note":"","active":true,"initialStock":45},{"id":"kem-dau-xanh","name":"Kem que Merino đậu xanh","category":"Kem","unit":"cây","costPrice":8000,"salePrice":13000,"stock":30,"minStock":6,"trackStock":true,"packSize":30,"purchasePrice":240000,"revenueMode":"direct_sale","source":"HĐ 11/06","formula":"HĐ 11/06","note":"","active":true,"initialStock":30},{"id":"kem-khoai-mon","name":"Kem que Merino khoai môn","category":"Kem","unit":"cây","costPrice":8000,"salePrice":13000,"stock":30,"minStock":6,"trackStock":true,"packSize":30,"purchasePrice":240000,"revenueMode":"direct_sale","source":"HĐ 11/06","formula":"HĐ 11/06","note":"","active":true,"initialStock":30},{"id":"kem-sua-chua-deo","name":"Sữa chua dẻo Merino phô mai","category":"Kem","unit":"cây","costPrice":4073,"salePrice":6000,"stock":133,"minStock":11,"trackStock":true,"packSize":55,"purchasePrice":224000,"revenueMode":"direct_sale","source":"HĐ 11/06","formula":"HĐ 11/06","note":"","active":true,"initialStock":133},{"id":"kem-que-khac","name":"Kem que khác","category":"Kem","unit":"cây","costPrice":0,"salePrice":13000,"stock":0,"minStock":0,"trackStock":true,"packSize":1,"purchasePrice":0,"revenueMode":"direct_sale","source":"Nhập giá vốn thực tế nếu có","formula":"Nhập giá vốn thực tế nếu có","note":"","active":true,"initialStock":0}],"sales":[],"debts":[{"id":"excel-2026-08-01-kh-ca-30000","customerId":"kh-ca","customer":"Cả","amount":30000,"paid":30000,"balance":0,"note":"2c đá banh","createdAt":"2026-08-01T05:00:00.000Z","payments":[{"id":"excel-payment-kh-ca--kh-ca-30000","amount":30000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-canh-pcn","customerId":"kh-canh-pcn","customer":"Cảnh PCN","amount":142000,"paid":0,"balance":142000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-chat","customerId":"kh-chat","customer":"Chất","amount":36000,"paid":0,"balance":36000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-chu-binh","customerId":"kh-chu-binh","customer":"Chú Bình","amount":192000,"paid":0,"balance":192000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-dung-pcn","customerId":"kh-dung-pcn","customer":"Dũng PCN","amount":120000,"paid":0,"balance":120000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-dang","customerId":"kh-dang","customer":"Đang","amount":147000,"paid":0,"balance":147000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-01-kh-dang-950000","customerId":"kh-dang","customer":"Đang","amount":950000,"paid":0,"balance":950000,"note":"Gà miếng 300, gà sáo 330, huda 320","createdAt":"2026-08-01T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-02-kh-dang-153000","customerId":"kh-dang","customer":"Đang","amount":153000,"paid":0,"balance":153000,"note":"6 larue, 3lx, 1xx","createdAt":"2026-08-02T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-dinh-thanh-67","customerId":"kh-dinh-thanh-67","customer":"Đình Thành 67","amount":138000,"paid":0,"balance":138000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-01-kh-dong-vb-26000","customerId":"kh-dong-vb","customer":"Đông VB","amount":26000,"paid":0,"balance":26000,"note":"1 suối, 1 bánh, 1sc","createdAt":"2026-08-01T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-03-kh-dong-vb-45000","customerId":"kh-dong-vb","customer":"Đông VB","amount":45000,"paid":0,"balance":45000,"note":"1 mì, 1bh","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-04-kh-dong-vb-95000","customerId":"kh-dong-vb","customer":"Đông VB","amount":95000,"paid":0,"balance":95000,"note":"1cf, 2lx, 1 cá viên, 2rock30","createdAt":"2026-08-04T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-dong-vb-15000","customerId":"kh-dong-vb","customer":"Đông VB","amount":15000,"paid":0,"balance":15000,"note":"1rock","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-duc-anh-tt63","customerId":"kh-duc-anh-tt63","customer":"Đức Anh TT63","amount":84000,"paid":0,"balance":84000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-01-kh-duc-anh-tt63-30000","customerId":"kh-duc-anh-tt63","customer":"Đức Anh TT63","amount":30000,"paid":0,"balance":30000,"note":"2c đá banh","createdAt":"2026-08-01T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-03-kh-duc-anh-tt63-30000","customerId":"kh-duc-anh-tt63","customer":"Đức Anh TT63","amount":30000,"paid":0,"balance":30000,"note":"2c","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-duc-anh-tt63-24000","customerId":"kh-duc-anh-tt63","customer":"Đức Anh TT63","amount":24000,"paid":0,"balance":24000,"note":"2c đá banh","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-duc-bu","customerId":"kh-duc-bu","customer":"Đức bự","amount":855000,"paid":855000,"balance":0,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[{"id":"excel-payment-kh-duc-bu-ng-kh-duc-bu","amount":855000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-01-kh-duc-bu-135000","customerId":"kh-duc-bu","customer":"Đức bự","amount":135000,"paid":135000,"balance":0,"note":"Bò né, 5 bánh chưng, 2 muối","createdAt":"2026-08-01T05:00:00.000Z","payments":[{"id":"excel-payment-kh-duc-bu-uc-bu-135000","amount":135000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-02-kh-duc-bu-18000","customerId":"kh-duc-bu","customer":"Đức bự","amount":18000,"paid":18000,"balance":0,"note":"Sc dẻo, nước","createdAt":"2026-08-02T05:00:00.000Z","payments":[{"id":"excel-payment-kh-duc-bu-duc-bu-18000","amount":18000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-03-kh-duc-bu-116000","customerId":"kh-duc-bu","customer":"Đức bự","amount":116000,"paid":116000,"balance":0,"note":"2 mì quảng, 1sc, 2sg bấm","createdAt":"2026-08-03T05:00:00.000Z","payments":[{"id":"excel-payment-kh-duc-bu-uc-bu-116000","amount":116000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-04-kh-duc-bu-110000","customerId":"kh-duc-bu","customer":"Đức bự","amount":110000,"paid":110000,"balance":0,"note":"1 bún bò","createdAt":"2026-08-04T05:00:00.000Z","payments":[{"id":"excel-payment-kh-duc-bu-uc-bu-110000","amount":110000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-duc-bu-35000","customerId":"kh-duc-bu","customer":"Đức bự","amount":35000,"paid":35000,"balance":0,"note":"Miếng","createdAt":"2026-08-05T05:00:00.000Z","payments":[{"id":"excel-payment-kh-duc-bu-duc-bu-35000","amount":35000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-duc-tp67","customerId":"kh-duc-tp67","customer":"Đức TP67","amount":159000,"paid":0,"balance":159000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-hai-xm","customerId":"kh-hai-xm","customer":"Hải XM","amount":171000,"paid":171000,"balance":0,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[{"id":"excel-payment-kh-hai-xm-ng-kh-hai-xm","amount":171000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-03-kh-hai-xm-42000","customerId":"kh-hai-xm","customer":"Hải XM","amount":42000,"paid":42000,"balance":0,"note":"1c, 1 mèo, 2mì 12","createdAt":"2026-08-03T05:00:00.000Z","payments":[{"id":"excel-payment-kh-hai-xm-hai-xm-42000","amount":42000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-04-kh-hai-xm-15000","customerId":"kh-hai-xm","customer":"Hải XM","amount":15000,"paid":15000,"balance":0,"note":"1cf","createdAt":"2026-08-04T05:00:00.000Z","payments":[{"id":"excel-payment-kh-hai-xm-hai-xm-15000","amount":15000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-hai-xm-33000","customerId":"kh-hai-xm","customer":"Hải XM","amount":33000,"paid":33000,"balance":0,"note":"Nợ phát sinh ngày 05/08/2026","createdAt":"2026-08-05T05:00:00.000Z","payments":[{"id":"excel-payment-kh-hai-xm-hai-xm-33000","amount":33000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-hoa-vb","customerId":"kh-hoa-vb","customer":"Hoà VB","amount":96000,"paid":0,"balance":96000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-hung-tac-chien","customerId":"kh-hung-tac-chien","customer":"Hùng Tác Chiến","amount":30000,"paid":0,"balance":30000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-hung-tp63","customerId":"kh-hung-tp63","customer":"Hùng TP63","amount":406000,"paid":406000,"balance":0,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[{"id":"excel-payment-kh-hung-tp63-kh-hung-tp63","amount":406000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-03-kh-hung-tp63-30000","customerId":"kh-hung-tp63","customer":"Hùng TP63","amount":30000,"paid":0,"balance":30000,"note":"2c","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-04-kh-khuong-16000","customerId":"kh-khuong","customer":"Khương","amount":16000,"paid":0,"balance":16000,"note":"1 larue","createdAt":"2026-08-04T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-lam-kt","customerId":"kh-lam-kt","customer":"Lâm KT","amount":48000,"paid":0,"balance":48000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-05-kh-lam-kt-30000","customerId":"kh-lam-kt","customer":"Lâm KT","amount":30000,"paid":0,"balance":30000,"note":"2c đá banh","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-liem","customerId":"kh-liem","customer":"Liêm","amount":930000,"paid":930000,"balance":0,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[{"id":"excel-payment-kh-liem-ning-kh-liem","amount":930000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-01-kh-long-714-320000","customerId":"kh-long-714","customer":"Long 714","amount":320000,"paid":320000,"balance":0,"note":"Huda","createdAt":"2026-08-01T05:00:00.000Z","payments":[{"id":"excel-payment-kh-long-714-g-714-320000","amount":320000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-m-linh","customerId":"kh-m-linh","customer":"M. Linh","amount":54000,"paid":0,"balance":54000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-04-kh-m-linh-98000","customerId":"kh-m-linh","customer":"M. Linh","amount":98000,"paid":0,"balance":98000,"note":"5c12, 2c15, 1 suối","createdAt":"2026-08-04T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-nguyen-pcn","customerId":"kh-nguyen-pcn","customer":"Nguyên PCN","amount":42000,"paid":0,"balance":42000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-phong","customerId":"kh-phong","customer":"Phóng","amount":460000,"paid":0,"balance":460000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-phu-67","customerId":"kh-phu-67","customer":"Phú 67","amount":626000,"paid":0,"balance":626000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-quang-tt","customerId":"kh-quang-tt","customer":"Quang TT","amount":36000,"paid":36000,"balance":0,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[{"id":"excel-payment-kh-quang-tt--kh-quang-tt","amount":36000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-03-kh-quynh-67-42000","customerId":"kh-quynh-67","customer":"Quỳnh 67","amount":42000,"paid":42000,"balance":0,"note":"1c, 1mì","createdAt":"2026-08-03T05:00:00.000Z","payments":[{"id":"excel-payment-kh-quynh-67-ynh-67-42000","amount":42000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-04-kh-quynh-67-33000","customerId":"kh-quynh-67","customer":"Quỳnh 67","amount":33000,"paid":33000,"balance":0,"note":"1mèo, 1 cf","createdAt":"2026-08-04T05:00:00.000Z","payments":[{"id":"excel-payment-kh-quynh-67-ynh-67-33000","amount":33000,"createdAt":"2026-08-06T05:00:00.000Z","note":"Đã trả theo sổ Excel"}],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-01-kh-thong-30000","customerId":"kh-thong","customer":"Thông","amount":30000,"paid":0,"balance":30000,"note":"2c đá banh","createdAt":"2026-08-01T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-03-kh-thong-30000","customerId":"kh-thong","customer":"Thông","amount":30000,"paid":0,"balance":30000,"note":"2c","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-toan-714","customerId":"kh-toan-714","customer":"Toản 714","amount":15000,"paid":0,"balance":15000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-opening-kh-trung-cong-tac","customerId":"kh-trung-cong-tac","customer":"Trung công tác","amount":96000,"paid":0,"balance":96000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-03-kh-trung-cong-tac-30000","customerId":"kh-trung-cong-tac","customer":"Trung công tác","amount":30000,"paid":0,"balance":30000,"note":"2c","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-trung-cong-tac-30000","customerId":"kh-trung-cong-tac","customer":"Trung công tác","amount":30000,"paid":0,"balance":30000,"note":"2c đá banh","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-03-kh-tuan-714-12000","customerId":"kh-tuan-714","customer":"Tuấn 714","amount":12000,"paid":0,"balance":12000,"note":"1c","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-tuan-714-20000","customerId":"kh-tuan-714","customer":"Tuấn 714","amount":20000,"paid":0,"balance":20000,"note":"Nợ phát sinh ngày 05/08/2026","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-02-kh-tuong-vb-54000","customerId":"kh-tuong-vb","customer":"Tưởng VB","amount":54000,"paid":0,"balance":54000,"note":"3 mèo","createdAt":"2026-08-02T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-van-doi-xe","customerId":"kh-van-doi-xe","customer":"Vân đội xe","amount":30000,"paid":0,"balance":30000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-05-kh-van-doi-xe-24000","customerId":"kh-van-doi-xe","customer":"Vân đội xe","amount":24000,"paid":0,"balance":24000,"note":"2c đá banh","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-opening-kh-vuong","customerId":"kh-vuong","customer":"Vượng","amount":309000,"paid":0,"balance":309000,"note":"Nợ cũ đến ngày 31/07/2026","createdAt":"2026-07-31T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"opening"},{"id":"excel-2026-08-01-kh-vuong-30000","customerId":"kh-vuong","customer":"Vượng","amount":30000,"paid":0,"balance":30000,"note":"2c đá banh","createdAt":"2026-08-01T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-02-kh-vuong-36000","customerId":"kh-vuong","customer":"Vượng","amount":36000,"paid":0,"balance":36000,"note":"2 mèo","createdAt":"2026-08-02T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-03-kh-vuong-48000","customerId":"kh-vuong","customer":"Vượng","amount":48000,"paid":0,"balance":48000,"note":"1 mèo, 2c 30","createdAt":"2026-08-03T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-04-kh-vuong-51000","customerId":"kh-vuong","customer":"Vượng","amount":51000,"paid":0,"balance":51000,"note":"Mèo, po, cf","createdAt":"2026-08-04T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-linh-tdt-57000","customerId":"kh-linh-tdt","customer":"Linh TĐT","amount":57000,"paid":0,"balance":57000,"note":"Sg bạc, 3c","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"},{"id":"excel-2026-08-05-kh-son-dt-90000","customerId":"kh-son-dt","customer":"Sơn DT","amount":90000,"paid":0,"balance":90000,"note":"2 omo, 1kem đánh răng","createdAt":"2026-08-05T05:00:00.000Z","payments":[],"source":"excel-so-no-thang-8-2026","kind":"manual"}],"meta":{"createdAt":"2026-08-06T03:55:44.000Z","version":4,"catalogUpdatedAt":"2026-08-06T06:07:31.424Z","productCount":42,"migratedAt":"2026-08-06T06:35:09.708Z","productSource":"Quan_ly_doanh_thu_cap_nhat_ton_kho_nuoc(1).xlsx","debtSource":"Sổ nợ.xlsm","debtImportVersion":"v1.3-full-36-customers"},"customers":[{"id":"kh-ca","name":"Cả","sortOrder":1,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-canh-pcn","name":"Cảnh PCN","sortOrder":2,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-chat","name":"Chất","sortOrder":3,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-chu-binh","name":"Chú Bình","sortOrder":4,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-dung-pcn","name":"Dũng PCN","sortOrder":5,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-dang","name":"Đang","sortOrder":6,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-dinh-thanh-67","name":"Đình Thành 67","sortOrder":7,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-dong-vb","name":"Đông VB","sortOrder":8,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-duc-anh-tt63","name":"Đức Anh TT63","sortOrder":9,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-duc-bu","name":"Đức bự","sortOrder":10,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-duc-tp67","name":"Đức TP67","sortOrder":11,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-hai-xm","name":"Hải XM","sortOrder":12,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-hoa-vb","name":"Hoà VB","sortOrder":13,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-hop-xd","name":"Hợp XD","sortOrder":14,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-hung-tac-chien","name":"Hùng Tác Chiến","sortOrder":15,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-hung-tp63","name":"Hùng TP63","sortOrder":16,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-khuong","name":"Khương","sortOrder":17,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-lam-kt","name":"Lâm KT","sortOrder":18,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-liem","name":"Liêm","sortOrder":19,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-long-714","name":"Long 714","sortOrder":20,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-m-linh","name":"M. Linh","sortOrder":21,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-nguyen-pcn","name":"Nguyên PCN","sortOrder":22,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-phong","name":"Phóng","sortOrder":23,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-phu-67","name":"Phú 67","sortOrder":24,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-quang-doi-xe","name":"Quang đội xe","sortOrder":25,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-quang-tt","name":"Quang TT","sortOrder":26,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-quynh-67","name":"Quỳnh 67","sortOrder":27,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-thong","name":"Thông","sortOrder":28,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-toan-714","name":"Toản 714","sortOrder":29,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-trung-cong-tac","name":"Trung công tác","sortOrder":30,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-tuan-714","name":"Tuấn 714","sortOrder":31,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-tuong-vb","name":"Tưởng VB","sortOrder":32,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-van-doi-xe","name":"Vân đội xe","sortOrder":33,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-vuong","name":"Vượng","sortOrder":34,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-linh-tdt","name":"Linh TĐT","sortOrder":35,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"},{"id":"kh-son-dt","name":"Sơn DT","sortOrder":36,"group":"","phone":"","note":"","active":true,"createdAt":"2026-08-06T06:35:09.707Z"}],"weeklyAudits":[]};
async function rpc(name, payload){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify(payload)});
  const text=await r.text(); let data=null; try{ data=text?JSON.parse(text):null; }catch{ data=text; }
  if(!r.ok){ const msg=(data&&data.message)||String(data||"Lỗi Supabase"); throw Object.assign(new Error(msg.includes("PIN_INVALID")?"Mã PIN không đúng.":msg),{status:msg.includes("PIN_INVALID")?401:r.status}); }
  return data;
}
async function validatePin(pin){ if(!pin)return false; try{return Boolean(await rpc("cantin_login",{p_pin:pin}));}catch{return false;} }
function makeReq(request, authenticated){ const h={}; for(const [k,v] of request.headers.entries())h[k.toLowerCase()]=v; return {method:request.method,headers:h,_request:request,authenticated}; }
function makeRes(){ return {status:200,headers:{},body:"",setHeader(k,v){this.headers[k]=v;},writeHead(status,headers={}){this.status=status;Object.assign(this.headers,headers);},end(body=""){this.body=body;}}; }
async function handleApi(req, res, url, readStore, updateStore, readRoot, updateRoot) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/stores") {
    const root=await readRoot(); return sendJson(res,200,{activeStoreId:root.activeStoreId,stores:root.stores.map(s=>({id:s.id,name:s.name,createdAt:s.createdAt,counts:{products:s.data.products.length,customers:s.data.customers.length,sales:s.data.sales.length,debts:s.data.debts.length}}))});
  }
  if (req.method === "POST" && pathname === "/api/stores") {
    const body=await readJsonBody(req); const name=String(body.name||"").trim(); if(!name) bad("Hãy đặt tên cửa hàng.");
    const item=await updateRoot(root=>{const id=newId(); const item={id,name,createdAt:new Date().toISOString(),data:emptyStore(name)}; root.stores.push(item); root.activeStoreId=id; return item;});
    return sendJson(res,201,item);
  }
  if (req.method === "POST" && pathname === "/api/stores/select") {
    const body=await readJsonBody(req); const item=await updateRoot(root=>{const found=root.stores.find(s=>s.id===body.id); if(!found)return null; root.activeStoreId=found.id; return found;});
    if(!item)return sendJson(res,404,{error:"Không tìm thấy cửa hàng."}); return sendJson(res,200,{ok:true,activeStoreId:item.id});
  }
  const storeParams=routeMatch(pathname,"/api/stores/:id");
  if(req.method==="PATCH"&&storeParams){const body=await readJsonBody(req);const item=await updateRoot(root=>{const x=root.stores.find(s=>s.id===storeParams.id);if(!x)return null;if(body.name!==undefined){x.name=String(body.name||"").trim()||x.name;x.data.meta=x.data.meta||{};x.data.meta.name=x.name;}return x;});if(!item)return sendJson(res,404,{error:"Không tìm thấy cửa hàng."});return sendJson(res,200,item);}
  if(req.method==="DELETE"&&storeParams){const item=await updateRoot(root=>{if(root.stores.length<=1)bad("Phải giữ lại ít nhất 1 cửa hàng.");const i=root.stores.findIndex(s=>s.id===storeParams.id);if(i<0)return null;const x=root.stores.splice(i,1)[0];if(root.activeStoreId===x.id)root.activeStoreId=root.stores[0].id;return x;});if(!item)return sendJson(res,404,{error:"Không tìm thấy cửa hàng."});return sendJson(res,200,{ok:true});}


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
    const data=await readStore(); const customerId=searchParams.get("customerId"), start=searchParams.get("start"), end=searchParams.get("end");
    const debts=data.debts.filter(d=>(!customerId||d.customerId===customerId)&&(!start||dateKey(d.createdAt)>=start)&&(!end||dateKey(d.createdAt)<=end)).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
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

  const paymentParams=routeMatch(pathname,"/api/debts/:debtId/payments/:paymentId");
  if(req.method==="PATCH"&&paymentParams){
    const body=await readJsonBody(req); const result=await updateStore(data=>{const debt=data.debts.find(d=>d.id===paymentParams.debtId);if(!debt)return null;const pay=(debt.payments||[]).find(p=>p.id===paymentParams.paymentId);if(!pay)return null;const old=Number(pay.amount)||0;let next=body.amount!==undefined?money(body.amount):old;if(next<=0)bad("Số tiền thanh toán phải lớn hơn 0.");const max=old+(Number(debt.balance)||0);if(next>max)bad(`Số tiền tối đa có thể sửa là ${formatMoney(max)}.`);pay.amount=next;if(body.note!==undefined)pay.note=String(body.note||"").trim();if(body.date!==undefined){const d=String(body.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(d))bad("Ngày thanh toán không hợp lệ.");pay.createdAt=isoAtNoon(d);}debt.paid=(Number(debt.paid)||0)-old+next;debt.balance=(Number(debt.amount)||0)-debt.paid;return {debt,payment:pay};});
    if(!result)return sendJson(res,404,{error:"Không tìm thấy lần thanh toán."}); return sendJson(res,200,result);
  }
  if(req.method==="DELETE"&&paymentParams){
    const result=await updateStore(data=>{const debt=data.debts.find(d=>d.id===paymentParams.debtId);if(!debt)return null;const i=(debt.payments||[]).findIndex(p=>p.id===paymentParams.paymentId);if(i<0)return null;const pay=debt.payments.splice(i,1)[0];debt.paid=Math.max(0,(Number(debt.paid)||0)-(Number(pay.amount)||0));debt.balance=(Number(debt.amount)||0)-debt.paid;return pay;});
    if(!result)return sendJson(res,404,{error:"Không tìm thấy lần thanh toán."}); return sendJson(res,200,{ok:true,deleted:result});
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
      const isLatest = latest?.id === record.id;
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
        if (isLatest) {
          if (oldLine && newLine) p.stock = Math.max(0, p.stock + newLine.endingStock - oldLine.endingStock);
          else if (oldLine) p.stock = Math.max(0, p.stock + (Number(oldLine.stockBefore ?? oldLine.openingStock) || 0) - oldLine.endingStock);
          else if (newLine) p.stock = newLine.endingStock;
        }
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
    const command = await updateStore(data => inventoryCommand(data, message));
    if (command && !command.error) return sendJson(res,200,{answer:command.answer,mode:"action",action:command});
    if (command && command.error) return sendJson(res,200,{answer:command.error,mode:"local"});
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

  if(req.method==="POST"&&pathname==="/api/import/backup"){
    const body=await readJsonBody(req); const incoming=body.data; if(!incoming||typeof incoming!=="object")bad("Tệp nhập không có dữ liệu hợp lệ.");
    const mode=body.mode==="merge"?"merge":"replace";
    const result=await updateStore(data=>{
      const src=ensureStoreShape(structuredClone(incoming));
      if(mode==="replace"){for(const key of ["products","customers","debts","sales","weeklyTemplate","weeklyAudits","stockAdjustments"])data[key]=src[key]||[];data.meta={...(data.meta||{}),...(src.meta||{})};}
      else {for(const key of ["products","customers","debts","sales","weeklyAudits","stockAdjustments"]){const existing=new Set((data[key]||[]).map(x=>x.id));for(const item of src[key]||[])if(!existing.has(item.id))data[key].push(item);}}
      return {ok:true,counts:{products:data.products.length,customers:data.customers.length,debts:data.debts.length,sales:data.sales.length,weeklyAudits:data.weeklyAudits.length}};
    }); return sendJson(res,200,result);
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


export async function onRequest(context){
  const request=context.request; const url=new URL(request.url); const pathname=url.pathname;
  try{
    if(pathname==="/api/health"){
      return new Response(JSON.stringify({ok:true,aiConfigured:true,aiMode:"local",storageMode:"supabase",authRequired:false,authenticated:true,version:"2.5-full-features"}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    }
    if(pathname==="/api/auth/login"&&request.method==="POST") return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    if(pathname==="/api/auth/logout"&&request.method==="POST") return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8"}});
    const readRoot=async()=>{ let raw=await rpc("cantin_read_store_public",{}); const root=normalizeRoot(raw); const migrated=syncCanonicalDebtData(root); if(!raw||raw.__multiStore!==true||migrated)await rpc("cantin_write_store_public",{p_data:root}); return root; };
    const updateRoot=async(mutator)=>{const root=await readRoot();const result=await mutator(root);await rpc("cantin_write_store_public",{p_data:root});return result;};
    const readStore=async()=>{const root=await readRoot();return activeStore(root).data;};
    const updateStore=async(mutator)=>{const root=await readRoot();const store=activeStore(root);const result=await mutator(store.data);await rpc("cantin_write_store_public",{p_data:root});return result;};
    const req=makeReq(request,true), res=makeRes();
    await handleApi(req,res,url,readStore,updateStore,readRoot,updateRoot);
    return new Response(res.body,{status:res.status,headers:res.headers});
  }catch(error){
    return new Response(JSON.stringify({error:error?.message||"Lỗi máy chủ."}),{status:error?.status||500,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }
}
