const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  products: [], customers: [], debts: [], sales: [], cart: [],
  weeklyTemplate: [], weeklyAudits: [], editingSaleId: "", editingSaleOriginal: null, editingAuditId: ""
};

const money = value => `${Math.round(Number(value) || 0).toLocaleString("vi-VN")} ₫`;
const number = value => (Number(value) || 0).toLocaleString("vi-VN");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[ch]);
const normalizeText = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dateTime = iso => new Intl.DateTimeFormat("vi-VN", { dateStyle:"short", timeStyle:"short", timeZone:"Asia/Ho_Chi_Minh" }).format(new Date(iso));
const dateOnly = iso => new Intl.DateTimeFormat("vi-VN", { dateStyle:"short", timeZone:"Asia/Ho_Chi_Minh" }).format(new Date(iso));
const dateKey = iso => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Ho_Chi_Minh" }).format(new Date(iso));
const todayKey = () => dateKey(new Date().toISOString());
const paymentLabel = value => ({ cash:"Tiền mặt", transfer:"Chuyển khoản", debt:"Ghi nợ", inventory:"Kiểm kho" })[value] || value;

async function api(url, options = {}) {
  const savedPin = localStorage.getItem("cantin_pin") || "";
  const headers = { "Content-Type":"application/json", ...(savedPin ? { "x-cantin-pin": savedPin } : {}), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Có lỗi xảy ra.");
  if (url === "/api/auth/login") {
    try { const body = JSON.parse(options.body || "{}"); if (body.pin) localStorage.setItem("cantin_pin", String(body.pin)); } catch {}
  }
  if (url === "/api/auth/logout") localStorage.removeItem("cantin_pin");
  return data;
}

function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = "toast"; }, 3200);
}

async function loadHealth() {
  try {
    const data = await api("/api/health");
    const aiLabel = data.aiMode === "hybrid" ? "AI mở rộng đã kết nối" : "Trợ lý miễn phí sẵn sàng";
    const storageLabel = data.storageMode === "postgres" ? " · Đã đồng bộ Cloud" : " · Lưu trong dự án";
    $("#ai-status").textContent = data.authRequired && !data.authenticated ? "Cần đăng nhập" : `${aiLabel}${storageLabel}`;
    $("#ai-status").classList.toggle("offline", data.authRequired && !data.authenticated);
    $("#login-screen").classList.toggle("hidden", !(data.authRequired && !data.authenticated));
    return data;
  } catch {
    $("#ai-status").textContent = "Mất kết nối app";
    $("#ai-status").classList.add("offline");
    throw new Error("Không kết nối được máy chủ ứng dụng.");
  }
}

async function navigateTo(page) {
  const tab = $(`.tab[data-page="${page}"]`);
  if (!tab) return;
  $$(".tab").forEach(item => item.classList.toggle("active", item === tab));
  $$(".page").forEach(item => item.classList.toggle("active", item.id === `page-${page}`));
  try {
    if (page === "dashboard") await loadDashboard();
    if (page === "sale") await Promise.all([loadProducts(), loadSales()]);
    if (page === "inventory") await loadProducts();
    if (page === "weekly") await loadWeekly();
    if (page === "customers") await loadCustomers();
  } catch (error) { toast(error.message, true); }
  window.scrollTo({ top:0, behavior:"smooth" });
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  $("#stat-revenue").textContent = money(data.todayRevenue);
  $("#stat-profit").textContent = money(data.todayProfit);
  $("#stat-month-revenue").textContent = money(data.monthRevenue);
  $("#stat-month-profit").textContent = money(data.monthProfit);
  $("#stat-customers").textContent = number(data.customerCount);
  $("#stat-debt").textContent = money(data.debtBalance);
  $("#low-stock-count").textContent = data.lowStock.length;
  $("#low-stock-list").className = `list${data.lowStock.length ? "" : " empty"}`;
  $("#low-stock-list").innerHTML = data.lowStock.length ? data.lowStock.map(p => `<div class="list-row"><div><strong>${escapeHtml(p.name)}</strong><small>Cảnh báo ${p.minStock} ${escapeHtml(p.unit)}</small></div><span class="low">Còn ${number(p.stock)}</span></div>`).join("") : "Chưa có sản phẩm sắp hết.";
  $("#recent-sales").className = `list${data.recentSales.length ? "" : " empty"}`;
  $("#recent-sales").innerHTML = data.recentSales.length ? data.recentSales.map(s => `<div class="list-row"><div><strong>${money(s.total)}</strong><small>${dateTime(s.createdAt)} · ${paymentLabel(s.paymentMethod)}${s.customer ? ` · ${escapeHtml(s.customer)}` : ""}</small></div><span>${escapeHtml(s.source === "weekly_inventory" ? "Kiểm kho" : `${s.items.length} mặt hàng`)}</span></div>`).join("") : "Chưa có giao dịch.";
  const audit = data.latestAudit;
  $("#latest-audit").className = `list${audit ? "" : " empty"}`;
  $("#latest-audit").innerHTML = audit ? `<div class="list-row"><div><strong>${audit.weekStart.split("-").reverse().join("/")} – ${audit.weekEnd.split("-").reverse().join("/")}</strong><small>${number(audit.totalSold)} sản phẩm đã bán</small></div><div><strong>${money(audit.totalRevenue)}</strong><small>Lãi ${money(audit.totalProfit)}</small></div></div>` : "Chưa có lần kiểm kho.";
}

async function loadProducts() {
  state.products = await api("/api/products");
  const categories = [...new Set(state.products.map(p => p.category))].sort((a, b) => a.localeCompare(b, "vi"));
  for (const selector of ["#product-category", "#sale-category"]) {
    const select = $(selector);
    const current = select.value;
    const first = selector === "#product-category" ? "Tất cả nhóm" : "Tất cả nhóm";
    select.innerHTML = `<option value="">${first}</option>${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}`;
    select.value = categories.includes(current) ? current : "";
  }
  renderProducts();
  renderQuickProducts();
}

function renderProducts() {
  const term = normalizeText($("#product-search").value), category = $("#product-category").value;
  const list = state.products.filter(p => (!term || normalizeText(`${p.name} ${p.category}`).includes(term)) && (!category || p.category === category));
  $("#products-table").innerHTML = list.map(p => `<tr><td><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.unit)} · Quy cách ${number(p.packSize)} · Giá vốn ${money(p.costPrice)}${p.active === false ? " · Đã ngừng dùng" : ""}</small></td><td>${escapeHtml(p.category)}</td><td>${money(p.salePrice)}</td><td class="${p.trackStock && p.stock <= p.minStock ? "low" : ""}">${p.trackStock ? `${number(p.stock)} ${escapeHtml(p.unit)}` : "Không theo dõi"}</td><td><span class="mode-tag ${p.revenueMode === "weekly_inventory" ? "weekly" : ""}">${p.revenueMode === "weekly_inventory" ? "Kiểm kho tuần" : "Theo đơn bán"}</span></td><td><button class="button small edit-product" data-id="${p.id}">Chi tiết</button></td></tr>`).join("");
}

function availableStock(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product || product.trackStock === false) return Infinity;
  const originalQty = state.editingSaleOriginal?.items.find(line => line.productId === productId)?.quantity || 0;
  return product.stock + originalQty;
}

function renderQuickProducts() {
  const term = normalizeText($("#sale-product-search").value), category = $("#sale-category").value;
  const list = state.products.filter(p => p.active !== false && (!term || normalizeText(`${p.name} ${p.category}`).includes(term)) && (!category || p.category === category));
  $("#quick-product-count").textContent = list.length;
  $("#quick-products").innerHTML = list.length ? list.map(p => {
    const available = availableStock(p.id);
    const unavailable = p.trackStock !== false && available <= 0;
    return `<button class="quick-product${unavailable ? " unavailable" : ""}" data-id="${p.id}" type="button" ${unavailable ? "disabled" : ""}><span>${escapeHtml(p.name)}</span><strong>${money(p.salePrice)}</strong><small>${p.trackStock === false ? "Không giới hạn" : `Còn ${number(available)} ${escapeHtml(p.unit)}`}</small></button>`;
  }).join("") : `<p class="hint">Không tìm thấy sản phẩm phù hợp.</p>`;
}

function addProductToCart(productId, quantity = 1) {
  const product = state.products.find(p => p.id === productId && p.active !== false);
  if (!product) return toast("Sản phẩm không còn tồn tại.", true);
  const current = state.cart.find(item => item.id === product.id);
  const next = (current?.quantity || 0) + quantity;
  if (product.trackStock !== false && next > availableStock(product.id)) return toast(`Kho chỉ còn ${availableStock(product.id)} ${product.unit}.`, true);
  if (current) current.quantity = next;
  else state.cart.push({ ...product, quantity });
  renderCart();
}

function renderCart() {
  $("#cart-list").className = `list${state.cart.length ? "" : " empty"}`;
  $("#cart-list").innerHTML = state.cart.length ? state.cart.map(item => `<div class="cart-row" data-id="${item.id}"><div class="cart-name"><strong>${escapeHtml(item.name)}</strong><small>${money(item.salePrice)} / ${escapeHtml(item.unit)}</small></div><div class="cart-controls"><button class="qty-button cart-minus" type="button">−</button><input class="cart-quantity" type="number" min="1" step="1" value="${item.quantity}" aria-label="Số lượng ${escapeHtml(item.name)}"><button class="qty-button cart-plus" type="button">+</button><button class="icon-button remove-cart" type="button" aria-label="Xóa ${escapeHtml(item.name)}">×</button></div><strong class="cart-subtotal">${money(item.quantity * item.salePrice)}</strong></div>`).join("") : "Chưa có sản phẩm.";
  $("#cart-total").textContent = money(state.cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0));
}

async function loadSales() {
  state.sales = await api("/api/sales?limit=500");
  renderSales();
}

function renderSales() {
  const term = normalizeText($("#sale-history-search").value), filter = $("#sale-history-filter").value;
  const list = state.sales.filter(sale => {
    const haystack = `${sale.customer} ${sale.note} ${sale.items.map(item => item.name).join(" ")}`;
    return (!term || normalizeText(haystack).includes(term)) && (filter === "all" || sale.paymentMethod === filter);
  });
  $("#sales-count").textContent = list.length;
  $("#sales-history").className = `order-list${list.length ? "" : " empty"}`;
  $("#sales-history").innerHTML = list.length ? list.map(sale => `<article class="order-card" data-id="${sale.id}"><div class="order-head"><div><strong>${money(sale.total)}</strong><small>${dateTime(sale.createdAt)} · ${paymentLabel(sale.paymentMethod)}${sale.customer ? ` · ${escapeHtml(sale.customer)}` : ""}</small></div><span class="mode-tag ${sale.source === "weekly_inventory" ? "weekly" : ""}">${sale.source === "weekly_inventory" ? "Từ kiểm kho" : `${sale.items.length} món`}</span></div><details class="details"><summary>Xem chi tiết đơn</summary><div class="order-items">${sale.items.map(item => `<div><span>${escapeHtml(item.name)} × ${number(item.quantity)}</span><strong>${money(item.subtotal)}</strong></div>`).join("")}</div><div class="order-totals"><span>Giá vốn: ${money(sale.costTotal)}</span><span>Lợi nhuận: ${money(sale.profit)}</span></div>${sale.note ? `<p class="hint">Ghi chú: ${escapeHtml(sale.note)}</p>` : ""}${sale.source === "pos" ? `<div class="inline-actions"><button class="button small secondary edit-sale" type="button">Chỉnh sửa</button><button class="button small danger delete-sale" type="button">Xóa đơn</button></div>` : ""}</details></article>`).join("") : "Không tìm thấy đơn hàng.";
}

function resetSaleForm() {
  state.editingSaleId = "";
  state.editingSaleOriginal = null;
  state.cart = [];
  $("#sale-mode-label").textContent = "TẠO ĐƠN";
  $("#sale-heading").textContent = "Bán hàng nhanh";
  $("#cancel-edit-sale").classList.add("hidden");
  $("#checkout").textContent = "Hoàn tất đơn";
  $("#sale-date").value = todayKey();
  $("#payment-method").value = "cash";
  $("#customer-field").classList.add("hidden");
  $("#sale-customer").value = "";
  $("#sale-note").value = "";
  renderCart();
  renderQuickProducts();
}

async function beginEditSale(saleId) {
  const sale = state.sales.find(item => item.id === saleId);
  if (!sale || sale.source !== "pos") return;
  const missing = sale.items.find(line => !state.products.some(p => p.id === line.productId));
  if (missing) return toast(`Không thể sửa vì mặt hàng “${missing.name}” đã bị xóa.`, true);
  state.editingSaleId = sale.id;
  state.editingSaleOriginal = sale;
  state.cart = sale.items.map(line => ({ ...state.products.find(p => p.id === line.productId), quantity:line.quantity }));
  $("#sale-mode-label").textContent = "CHỈNH SỬA ĐƠN";
  $("#sale-heading").textContent = `Đơn ngày ${dateOnly(sale.createdAt)}`;
  $("#cancel-edit-sale").classList.remove("hidden");
  $("#checkout").textContent = "Lưu thay đổi đơn";
  $("#sale-date").value = dateKey(sale.createdAt);
  $("#payment-method").value = sale.paymentMethod;
  $("#customer-field").classList.toggle("hidden", sale.paymentMethod !== "debt");
  $("#sale-customer").value = sale.customerId || "";
  $("#sale-note").value = sale.note || "";
  renderCart();
  renderQuickProducts();
  window.scrollTo({ top:0, behavior:"smooth" });
}

async function loadCustomers() {
  [state.customers, state.debts] = await Promise.all([api("/api/customers"), api("/api/debts")]);
  const active = state.customers.filter(c => c.active !== false);
  const current = $("#sale-customer").value;
  $("#sale-customer").innerHTML = `<option value="">Chọn khách hàng</option>${active.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.debtBalance ? ` — đang nợ ${money(c.debtBalance)}` : ""}</option>`).join("")}`;
  if (active.some(c => c.id === current)) $("#sale-customer").value = current;
  renderCustomers();
}

function renderCustomers() {
  const term = normalizeText($("#customer-search").value), filter = $("#customer-filter").value;
  const list = state.customers.filter(c => (!term || normalizeText(`${c.name} ${c.group} ${c.phone}`).includes(term)) && (filter === "all" || (filter === "owing" ? c.debtBalance > 0 : c.debtBalance <= 0)));
  $("#customers-list").className = `cards-list${list.length ? "" : " empty"}`;
  $("#customers-list").innerHTML = list.length ? list.map(customer => {
    const debts = state.debts.filter(d => d.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const openDebts = debts.filter(d => d.balance > 0);
    const debtOptions = openDebts.map(d => `<option value="${d.id}">${dateOnly(d.createdAt)} · ${escapeHtml(d.note || "Khoản nợ")} · còn ${money(d.balance)}</option>`).join("");
    const history = debts.length ? debts.map(debt => `<article class="debt-entry" data-debt-id="${debt.id}"><div class="debt-line"><div><strong>${money(debt.amount)}</strong><small>${dateOnly(debt.createdAt)} · ${escapeHtml(debt.note || "Không có ghi chú")}</small></div><div class="debt-status">${debt.balance ? `Còn ${money(debt.balance)}` : "Đã trả"}</div></div><div class="debt-edit-grid"><label class="field">Ngày<input class="edit-debt-date" type="date" value="${dateKey(debt.createdAt)}"></label><label class="field">Tổng khoản nợ<input class="edit-debt-amount" type="number" min="1" step="1000" value="${debt.amount}"></label><label class="field span-2">Món nợ/Ghi chú<input class="edit-debt-note" value="${escapeHtml(debt.note || "")}"></label></div>${debt.payments?.length ? `<p class="hint compact">Đã trả ${money(debt.paid)} qua ${debt.payments.length} lần.</p>` : ""}<div class="inline-actions"><button class="button small secondary save-debt" type="button">Lưu sửa đổi</button><button class="button small danger delete-debt" type="button">Xóa khoản nợ</button></div></article>`).join("") : "<p class='hint'>Chưa có khoản nợ.</p>";
    return `<article class="customer-card" data-id="${customer.id}"><div class="customer-top"><div><h3>${escapeHtml(customer.name)}</h3><div class="customer-meta">${escapeHtml(customer.group || "Chưa có đơn vị")}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}</div></div><div class="debt-balance ${customer.debtBalance <= 0 ? "zero" : ""}">${money(customer.debtBalance)}</div></div>${customer.note ? `<p class="hint">${escapeHtml(customer.note)}</p>` : ""}<div class="debt-action-box"><h4>Thêm khoản nợ</h4><div class="debt-form-grid"><input class="new-debt-date" type="date" value="${todayKey()}" aria-label="Ngày ghi nợ"><input class="new-debt-amount" type="number" min="1000" step="1000" placeholder="Số tiền nợ"><input class="new-debt-note" placeholder="Món nợ"></div><button class="button small add-debt" type="button">Ghi nợ thủ công</button></div>${customer.debtBalance > 0 ? `<div class="debt-action-box pay-box"><h4>Ghi nhận trả nợ</h4><div class="debt-form-grid pay-grid"><input class="pay-amount" type="number" min="1000" step="1000" max="${customer.debtBalance}" placeholder="Số tiền trả"><select class="pay-debt-id" aria-label="Chọn khoản nợ"><option value="">Tự động trừ khoản cũ nhất</option>${debtOptions}</select><input class="pay-note" placeholder="Ghi chú trả nợ"></div><button class="button small secondary pay-customer" type="button">Ghi nhận trả nợ</button></div>` : ""}<details class="details debt-history"><summary>Lịch sử ${debts.length} khoản</summary>${history}</details></article>`;
  }).join("") : "Không tìm thấy khách hàng.";
}

function fillEditProduct(product) {
  const form = $("#edit-product-form");
  for (const [key, value] of Object.entries(product)) {
    const field = form.elements.namedItem(key);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  }
  $("#edit-product-panel").classList.remove("hidden");
  $("#edit-product-panel").scrollIntoView({ behavior:"smooth", block:"start" });
}

function setDefaultWeek(force = false) {
  const now = new Date(), year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  const startDay = 1 + Math.floor((day - 1) / 7) * 7;
  const endDay = Math.min(startDay + 6, new Date(year, month + 1, 0).getDate());
  const format = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (force || !$("#week-start").value) $("#week-start").value = format(new Date(year, month, startDay));
  if (force || !$("#week-end").value) $("#week-end").value = format(new Date(year, month, endDay));
}

function renderWeeklyTable(lines = null) {
  const rows = lines || state.weeklyTemplate.map(product => ({ ...product, productId:product.id, receivedCases:0, receivedUnits:0, endingStock:product.openingStock }));
  $("#weekly-table").innerHTML = rows.map(line => {
    const product = state.products.find(p => p.id === (line.productId || line.id));
    if (!product) return "";
    const opening = line.openingStock ?? product.stock;
    return `<tr data-id="${product.id}" data-price="${product.salePrice}" data-cost="${product.costPrice}" data-pack="${product.packSize}"><td><strong>${escapeHtml(product.name)}</strong><small>${product.packSize} ${escapeHtml(product.unit)}/thùng</small></td><td><input class="opening" type="number" min="0" step="1" value="${opening}"></td><td><input class="received-cases" type="number" min="0" step="1" value="${line.receivedCases || 0}"></td><td><input class="received-units" type="number" min="0" step="1" value="${line.receivedUnits || 0}"></td><td><input class="ending" type="number" min="0" step="1" value="${line.endingStock ?? opening}"></td><td class="calc-sold">0</td><td class="calc-revenue">0 ₫</td></tr>`;
  }).join("");
  calculateWeekly();
}

async function loadWeekly() {
  [state.weeklyTemplate, state.weeklyAudits] = await Promise.all([api("/api/weekly-inventory/template"), api("/api/weekly-inventory")]);
  setDefaultWeek();
  if (!state.editingAuditId) renderWeeklyTable();
  renderWeeklyHistory();
}

function calculateWeekly() {
  let totalQty = 0, totalRevenue = 0, totalProfit = 0;
  $$("#weekly-table tr").forEach(row => {
    const opening = Number(row.querySelector(".opening").value) || 0;
    const cases = Number(row.querySelector(".received-cases").value) || 0;
    const units = Number(row.querySelector(".received-units").value) || 0;
    const ending = Number(row.querySelector(".ending").value) || 0;
    const pack = Number(row.dataset.pack) || 1, price = Number(row.dataset.price) || 0, cost = Number(row.dataset.cost) || 0;
    const sold = Math.max(0, opening + cases * pack + units - ending), revenue = sold * price;
    row.querySelector(".calc-sold").textContent = number(sold);
    row.querySelector(".calc-revenue").textContent = money(revenue);
    totalQty += sold; totalRevenue += revenue; totalProfit += sold * (price - cost);
  });
  $("#week-total-qty").textContent = number(totalQty);
  $("#week-total-revenue").textContent = money(totalRevenue);
  $("#week-total-profit").textContent = money(totalProfit);
}

function renderWeeklyHistory() {
  const latestId = state.weeklyAudits[0]?.id;
  $("#weekly-history").className = `list${state.weeklyAudits.length ? "" : " empty"}`;
  $("#weekly-history").innerHTML = state.weeklyAudits.length ? state.weeklyAudits.map(audit => `<article class="audit-card" data-id="${audit.id}"><div class="list-row"><div><strong>${audit.weekStart.split("-").reverse().join("/")} – ${audit.weekEnd.split("-").reverse().join("/")}</strong><small>${number(audit.totalSold)} sản phẩm · ${audit.note ? escapeHtml(audit.note) : "Đã chốt"}</small></div><div><strong>${money(audit.totalRevenue)}</strong><small>Lãi ${money(audit.totalProfit)}</small></div></div><details class="details"><summary>Xem ${audit.lines.length} mặt hàng đã kiểm</summary><div class="order-items">${audit.lines.map(line => `<div><span>${escapeHtml(line.name)} · tồn ${number(line.openingStock)} → ${number(line.endingStock)} · bán ${number(line.soldQty)}</span><strong>${money(line.revenue)}</strong></div>`).join("")}</div>${audit.id === latestId ? `<div class="inline-actions"><button class="button small secondary edit-weekly" type="button">Chỉnh sửa</button><button class="button small danger delete-weekly" type="button">Xóa đơn kiểm kho</button></div>` : `<p class="hint compact">Chỉ đơn kiểm kho mới nhất được chỉnh sửa hoặc xóa để không làm sai tồn hiện tại.</p>`}</details></article>`).join("") : "Chưa có dữ liệu kiểm kho.";
}

function beginEditWeekly(auditId) {
  const audit = state.weeklyAudits.find(item => item.id === auditId);
  if (!audit || state.weeklyAudits[0]?.id !== audit.id) return toast("Chỉ có thể sửa đơn kiểm kho mới nhất.", true);
  state.editingAuditId = audit.id;
  $("#week-start").value = audit.weekStart;
  $("#week-end").value = audit.weekEnd;
  $("#week-note").value = audit.note || "";
  $("#save-weekly").textContent = "Lưu chỉnh sửa kiểm kho";
  $("#cancel-edit-weekly").classList.remove("hidden");
  renderWeeklyTable(audit.lines);
  $("#page-weekly").scrollIntoView({ behavior:"smooth", block:"start" });
}

function cancelEditWeekly() {
  state.editingAuditId = "";
  $("#week-note").value = "";
  $("#save-weekly").textContent = "Chốt kiểm kho tuần";
  $("#cancel-edit-weekly").classList.add("hidden");
  setDefaultWeek(true);
  renderWeeklyTable();
}

$(".tabs").addEventListener("click", event => {
  const tab = event.target.closest(".tab");
  if (tab) navigateTo(tab.dataset.page);
});

$("#page-dashboard").addEventListener("click", event => {
  const target = event.target.closest(".dashboard-link");
  if (target) navigateTo(target.dataset.target);
});
$("#page-dashboard").addEventListener("keydown", event => {
  const target = event.target.closest(".dashboard-link");
  if (target && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); navigateTo(target.dataset.target); }
});

$("#sale-product-search").addEventListener("input", renderQuickProducts);
$("#sale-category").addEventListener("change", renderQuickProducts);
$("#quick-products").addEventListener("click", event => {
  const button = event.target.closest(".quick-product");
  if (button) addProductToCart(button.dataset.id);
});

$("#cart-list").addEventListener("click", event => {
  const row = event.target.closest(".cart-row");
  if (!row) return;
  const item = state.cart.find(line => line.id === row.dataset.id);
  if (!item) return;
  if (event.target.closest(".remove-cart")) state.cart = state.cart.filter(line => line.id !== item.id);
  if (event.target.closest(".cart-minus")) item.quantity = Math.max(1, item.quantity - 1);
  if (event.target.closest(".cart-plus")) {
    if (item.trackStock !== false && item.quantity + 1 > availableStock(item.id)) return toast(`Kho chỉ còn ${availableStock(item.id)} ${item.unit}.`, true);
    item.quantity += 1;
  }
  renderCart();
});
$("#cart-list").addEventListener("change", event => {
  const input = event.target.closest(".cart-quantity"), row = event.target.closest(".cart-row");
  if (!input || !row) return;
  const item = state.cart.find(line => line.id === row.dataset.id);
  if (!item) return;
  const value = Math.max(1, Number(input.value) || 1);
  if (item.trackStock !== false && value > availableStock(item.id)) { input.value = item.quantity; return toast(`Kho chỉ còn ${availableStock(item.id)} ${item.unit}.`, true); }
  item.quantity = value;
  renderCart();
});

$("#payment-method").addEventListener("change", event => $("#customer-field").classList.toggle("hidden", event.target.value !== "debt"));
$("#cancel-edit-sale").addEventListener("click", resetSaleForm);
$("#checkout").addEventListener("click", async () => {
  if (!state.cart.length) return toast("Đơn hàng chưa có sản phẩm.", true);
  const payload = { items:state.cart.map(item => ({ productId:item.id, quantity:item.quantity })), paymentMethod:$("#payment-method").value, customerId:$("#sale-customer").value, note:$("#sale-note").value, date:$("#sale-date").value };
  try {
    const editing = Boolean(state.editingSaleId);
    await api(editing ? `/api/sales/${state.editingSaleId}` : "/api/sales", { method:editing ? "PATCH" : "POST", body:JSON.stringify(payload) });
    resetSaleForm();
    toast(editing ? "Đã cập nhật đơn hàng." : "Đã lưu đơn và cập nhật kho.");
    await Promise.all([loadProducts(), loadCustomers(), loadDashboard(), loadSales()]);
  } catch (error) { toast(error.message, true); }
});

$("#sale-history-search").addEventListener("input", renderSales);
$("#sale-history-filter").addEventListener("change", renderSales);
$("#sales-history").addEventListener("click", async event => {
  const card = event.target.closest(".order-card");
  if (!card) return;
  if (event.target.closest(".edit-sale")) return beginEditSale(card.dataset.id);
  if (event.target.closest(".delete-sale")) {
    if (!confirm("Xóa đơn hàng này? Tồn kho sẽ được hoàn lại tự động.")) return;
    try {
      await api(`/api/sales/${card.dataset.id}`, { method:"DELETE" });
      if (state.editingSaleId === card.dataset.id) resetSaleForm();
      toast("Đã xóa đơn và hoàn lại tồn kho.");
      await Promise.all([loadProducts(), loadCustomers(), loadDashboard(), loadSales()]);
    } catch (error) { toast(error.message, true); }
  }
});

$("#show-add-product").addEventListener("click", () => $("#add-product-panel").classList.toggle("hidden"));
$("#product-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget), payload = Object.fromEntries(form);
  payload.trackStock = form.get("trackStock") === "on";
  try {
    await api("/api/products", { method:"POST", body:JSON.stringify(payload) });
    event.currentTarget.reset();
    $("#add-product-panel").classList.add("hidden");
    toast("Đã thêm mặt hàng.");
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) { toast(error.message, true); }
});
$("#products-table").addEventListener("click", event => {
  const button = event.target.closest(".edit-product");
  if (!button) return;
  const product = state.products.find(item => item.id === button.dataset.id);
  if (product) fillEditProduct(product);
});
$("#close-edit-product").addEventListener("click", () => $("#edit-product-panel").classList.add("hidden"));
$("#edit-product-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget), payload = Object.fromEntries(form), id = payload.id;
  delete payload.id;
  payload.trackStock = form.get("trackStock") === "on";
  payload.active = form.get("active") === "on";
  try {
    await api(`/api/products/${id}`, { method:"PATCH", body:JSON.stringify(payload) });
    $("#edit-product-panel").classList.add("hidden");
    toast("Đã cập nhật chi tiết mặt hàng.");
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) { toast(error.message, true); }
});
$("#delete-product").addEventListener("click", async () => {
  const id = $("#edit-product-form").elements.namedItem("id").value;
  const product = state.products.find(item => item.id === id);
  if (!product || !confirm(`Xóa mặt hàng “${product.name}”? Lịch sử các đơn cũ vẫn được giữ lại.`)) return;
  try {
    await api(`/api/products/${id}`, { method:"DELETE" });
    state.cart = state.cart.filter(item => item.id !== id);
    $("#edit-product-panel").classList.add("hidden");
    renderCart();
    toast("Đã xóa mặt hàng.");
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) { toast(error.message, true); }
});
$("#product-search").addEventListener("input", renderProducts);
$("#product-category").addEventListener("change", renderProducts);

$("#show-add-customer").addEventListener("click", () => $("#add-customer-panel").classList.toggle("hidden"));
$("#customer-form").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api("/api/customers", { method:"POST", body:JSON.stringify(payload) });
    event.currentTarget.reset();
    $("#add-customer-panel").classList.add("hidden");
    toast("Đã thêm khách hàng.");
    await Promise.all([loadCustomers(), loadDashboard()]);
  } catch (error) { toast(error.message, true); }
});
$("#customer-search").addEventListener("input", renderCustomers);
$("#customer-filter").addEventListener("change", renderCustomers);
$("#customers-list").addEventListener("click", async event => {
  const card = event.target.closest(".customer-card");
  if (!card) return;
  try {
    if (event.target.closest(".add-debt")) {
      const payload = { date:card.querySelector(".new-debt-date").value, amount:card.querySelector(".new-debt-amount").value, note:card.querySelector(".new-debt-note").value };
      await api(`/api/customers/${card.dataset.id}/debts`, { method:"POST", body:JSON.stringify(payload) });
      toast("Đã thêm khoản nợ.");
      await Promise.all([loadCustomers(), loadDashboard()]);
    }
    if (event.target.closest(".pay-customer")) {
      const payload = { amount:card.querySelector(".pay-amount").value, debtId:card.querySelector(".pay-debt-id").value, note:card.querySelector(".pay-note").value };
      await api(`/api/customers/${card.dataset.id}/payments`, { method:"POST", body:JSON.stringify(payload) });
      toast(payload.debtId ? "Đã trừ vào khoản nợ đã chọn." : "Đã tự động trừ các khoản nợ cũ nhất.");
      await Promise.all([loadCustomers(), loadDashboard()]);
    }
    const debtEntry = event.target.closest(".debt-entry");
    if (debtEntry && event.target.closest(".save-debt")) {
      const payload = { date:debtEntry.querySelector(".edit-debt-date").value, amount:debtEntry.querySelector(".edit-debt-amount").value, note:debtEntry.querySelector(".edit-debt-note").value };
      await api(`/api/debts/${debtEntry.dataset.debtId}`, { method:"PATCH", body:JSON.stringify(payload) });
      toast("Đã cập nhật khoản nợ.");
      await Promise.all([loadCustomers(), loadDashboard(), loadSales()]);
    }
    if (debtEntry && event.target.closest(".delete-debt")) {
      if (!confirm("Xóa khoản nợ này? Thao tác sẽ xóa cả lịch sử thanh toán nằm trong khoản này.")) return;
      await api(`/api/debts/${debtEntry.dataset.debtId}`, { method:"DELETE" });
      toast("Đã xóa khoản nợ.");
      await Promise.all([loadCustomers(), loadDashboard(), loadSales()]);
    }
  } catch (error) { toast(error.message, true); }
});

$("#weekly-table").addEventListener("input", calculateWeekly);
$("#cancel-edit-weekly").addEventListener("click", cancelEditWeekly);
$("#save-weekly").addEventListener("click", async () => {
  const lines = $$("#weekly-table tr").map(row => ({ productId:row.dataset.id, openingStock:row.querySelector(".opening").value, receivedCases:row.querySelector(".received-cases").value, receivedUnits:row.querySelector(".received-units").value, endingStock:row.querySelector(".ending").value }));
  const editing = Boolean(state.editingAuditId);
  if (!confirm(editing ? "Lưu các thay đổi của đơn kiểm kho này?" : "Chốt kiểm kho tuần và ghi doanh thu tự động?")) return;
  try {
    const url = editing ? `/api/weekly-inventory/${state.editingAuditId}` : "/api/weekly-inventory";
    const audit = await api(url, { method:editing ? "PATCH" : "POST", body:JSON.stringify({ weekStart:$("#week-start").value, weekEnd:$("#week-end").value, note:$("#week-note").value, lines }) });
    cancelEditWeekly();
    toast(editing ? "Đã cập nhật đơn kiểm kho." : `Đã chốt doanh thu ${money(audit.totalRevenue)}.`);
    await Promise.all([loadWeekly(), loadProducts(), loadDashboard(), loadSales()]);
  } catch (error) { toast(error.message, true); }
});
$("#weekly-history").addEventListener("click", async event => {
  const card = event.target.closest(".audit-card");
  if (!card) return;
  if (event.target.closest(".edit-weekly")) return beginEditWeekly(card.dataset.id);
  if (event.target.closest(".delete-weekly")) {
    if (!confirm("Xóa đơn kiểm kho mới nhất? Doanh thu tự tính từ đơn này cũng sẽ được xóa và tồn kho được hoàn lại.")) return;
    try {
      await api(`/api/weekly-inventory/${card.dataset.id}`, { method:"DELETE" });
      if (state.editingAuditId === card.dataset.id) cancelEditWeekly();
      toast("Đã xóa đơn kiểm kho.");
      await Promise.all([loadWeekly(), loadProducts(), loadDashboard(), loadSales()]);
    } catch (error) { toast(error.message, true); }
  }
});

$("#chat-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#chat-message"), message = input.value.trim();
  if (!message) return;
  const box = $("#chat-messages");
  box.insertAdjacentHTML("beforeend", `<div class="message user">${escapeHtml(message)}</div>`);
  input.value = "";
  const loading = document.createElement("div");
  loading.className = "message assistant";
  loading.textContent = "Đang phân tích dữ liệu…";
  box.appendChild(loading);
  box.scrollTop = box.scrollHeight;
  try {
    const result = await api("/api/ai/chat", { method:"POST", body:JSON.stringify({ message }) });
    loading.textContent = result.answer;
  } catch (error) { loading.textContent = `Lỗi: ${error.message}`; }
  box.scrollTop = box.scrollHeight;
});

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const pin = $("#login-pin").value.trim(), errorBox = $("#login-error");
  errorBox.textContent = "";
  try {
    await api("/api/auth/login", { method:"POST", body:JSON.stringify({ pin }) });
    $("#login-screen").classList.add("hidden");
    $("#login-pin").value = "";
    await initAppData();
  } catch (error) { errorBox.textContent = error.message; }
});

async function initAppData() {
  $("#sale-date").value = todayKey();
  await Promise.all([loadProducts(), loadCustomers(), loadDashboard(), loadSales()]);
  renderCart();
  setDefaultWeek();
}

async function init() {
  try {
    const health = await loadHealth();
    if (!(health.authRequired && !health.authenticated)) await initAppData();
  } catch (error) { toast(error.message, true); }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
}

init();
