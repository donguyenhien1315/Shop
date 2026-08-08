const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  products: [], customers: [], debts: [], sales: [], cart: [], stores: [], activeStoreId: "",
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
  const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Có lỗi xảy ra.");
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
    $("#ai-status").textContent = `${aiLabel}${storageLabel}`;
    $("#ai-status").classList.remove("offline");
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
    if (page === "data") await loadStores();
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
    const available = availableStock(p.id), selected = state.cart.find(x => x.id === p.id)?.quantity || 0;
    const unavailable = p.trackStock !== false && available <= 0 && !selected;
    return `<button class="quick-product${unavailable ? " unavailable" : ""}${selected ? " selected" : ""}" data-id="${p.id}" type="button" ${unavailable ? "disabled" : ""}>${selected ? `<span class="quick-selected-count" title="Số lượng đã chọn">${selected}</span><span class="quick-selected-remove" title="Xóa khỏi đơn">×</span>` : ""}<span>${escapeHtml(p.name)}</span><strong>${money(p.salePrice)}</strong><small>${p.trackStock === false ? "Không giới hạn" : `Còn ${number(available)} ${escapeHtml(p.unit)}`}</small></button>`;
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
  if ($("#quick-products")) renderQuickProducts();
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
  const sortMode = $("#customer-sort")?.value || "az";
  const from = $("#debt-date-from")?.value || "", to = $("#debt-date-to")?.value || "";
  const inRange = debt => (!from || dateKey(debt.createdAt) >= from) && (!to || dateKey(debt.createdAt) <= to);
  let list = state.customers.filter(c => (!term || normalizeText(`${c.name} ${c.group} ${c.phone}`).includes(term)) && (filter === "all" || (filter === "owing" ? c.debtBalance > 0 : c.debtBalance <= 0)));
  if (from || to) list = list.filter(c => state.debts.some(d => d.customerId === c.id && inRange(d)));
  list.sort((a,b)=>sortMode==="debt"?(b.debtBalance-a.debtBalance):(sortMode==="za"?b.name.localeCompare(a.name,"vi"):a.name.localeCompare(b.name,"vi")));
  $("#customers-list").className = `cards-list${list.length ? "" : " empty"}`;
  $("#customers-list").innerHTML = list.length ? list.map(customer => {
    const allDebts = state.debts.filter(d => d.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const debts = allDebts.filter(inRange), openDebts = allDebts.filter(d => d.balance > 0);
    const debtOptions = openDebts.map(d => `<option value="${d.id}">${dateOnly(d.createdAt)} · ${escapeHtml(d.note || "Khoản nợ")} · còn ${money(d.balance)}</option>`).join("");
    const filteredBalance = debts.reduce((sum,d)=>sum+(Number(d.balance)||0),0);
    const history = debts.length ? debts.map(debt => {
      const payments=(debt.payments||[]).map(pay=>`<div class="payment-entry" data-payment-id="${pay.id}"><label class="field">Ngày trả<input class="edit-payment-date" type="date" value="${dateKey(pay.createdAt)}"></label><label class="field">Số tiền<input class="edit-payment-amount money-input" inputmode="decimal" value="${formatMoneyInput(pay.amount)}"></label><label class="field grow">Ghi chú<input class="edit-payment-note" value="${escapeHtml(pay.note||"")}"></label><button class="button small secondary save-payment" type="button">Lưu trả nợ</button><button class="button small danger delete-payment" type="button">×</button></div>`).join("");
      return `<article class="debt-entry" data-debt-id="${debt.id}"><div class="debt-line"><div><strong>${money(debt.amount)}</strong><small>${dateOnly(debt.createdAt)} · ${escapeHtml(debt.note || "Không có ghi chú")}</small></div><div class="debt-status">${debt.balance ? `Còn ${money(debt.balance)}` : "Đã trả"}</div></div><div class="debt-edit-grid"><label class="field">Ngày<input class="edit-debt-date" type="date" value="${dateKey(debt.createdAt)}"></label><label class="field">Tổng khoản nợ<input class="edit-debt-amount money-input" inputmode="decimal" value="${formatMoneyInput(debt.amount)}"></label><label class="field span-2">Món nợ/Ghi chú<input class="edit-debt-note" value="${escapeHtml(debt.note || "")}"></label></div>${debt.payments?.length ? `<details class="payment-history"><summary>Đã trả ${money(debt.paid)} qua ${debt.payments.length} lần — chỉnh chi tiết</summary>${payments}</details>` : ""}<div class="inline-actions"><button class="button small secondary save-debt" type="button">Lưu sửa đổi</button><button class="button small danger delete-debt" type="button">Xóa khoản nợ</button></div></article>`;
    }).join("") : "<p class='hint'>Không có khoản nợ trong khoảng ngày đã chọn.</p>";
    const balanceLabel=(from||to)?`Trong kỳ: ${money(filteredBalance)} · Tổng còn nợ: ${money(customer.debtBalance)}`:money(customer.debtBalance);
    return `<article class="customer-card compact-customer" data-id="${customer.id}"><details class="customer-details"><summary class="customer-summary"><div><h3>${escapeHtml(customer.name)}</h3><small>${escapeHtml(customer.group || "")}</small></div><div class="debt-balance ${customer.debtBalance <= 0 ? "zero" : ""}">${balanceLabel}</div></summary><div class="customer-expanded">${customer.note ? `<p class="hint">${escapeHtml(customer.note)}</p>` : ""}<div class="debt-action-box"><h4>Thêm khoản nợ</h4><div class="debt-form-grid"><input class="new-debt-date" type="date" value="${todayKey()}" aria-label="Ngày ghi nợ"><input class="new-debt-amount money-input" inputmode="decimal" placeholder="Số tiền nợ"><input class="new-debt-note" placeholder="Món nợ"></div><button class="button small add-debt" type="button">Ghi nợ thủ công</button></div>${customer.debtBalance > 0 ? `<div class="debt-action-box pay-box"><h4>Ghi nhận trả nợ</h4><div class="debt-form-grid pay-grid"><input class="pay-amount money-input" inputmode="decimal" placeholder="Số tiền trả"><select class="pay-debt-id" aria-label="Chọn khoản nợ"><option value="">Tự động trừ khoản cũ nhất</option>${debtOptions}</select><input class="pay-note" placeholder="Ghi chú trả nợ"></div><button class="button small secondary pay-customer" type="button">Ghi nhận trả nợ</button></div>` : ""}<div class="debt-history">${history}</div></div></details></article>`;
  }).join("") : "Không tìm thấy công nợ phù hợp.";
  bindMoneyInputs($("#customers-list"));
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
  $("#weekly-history").className = `list${state.weeklyAudits.length ? "" : " empty"}`;
  $("#weekly-history").innerHTML = state.weeklyAudits.length ? state.weeklyAudits.map(audit => `<article class="audit-card" data-id="${audit.id}"><div class="list-row"><div><strong>${audit.weekStart.split("-").reverse().join("/")} – ${audit.weekEnd.split("-").reverse().join("/")}</strong><small>${audit.createdAt ? new Date(audit.createdAt).toLocaleString("vi-VN") + " · " : ""}${number(audit.totalSold)} sản phẩm · ${audit.note ? escapeHtml(audit.note) : "Đã chốt"}</small></div><div><strong>${money(audit.totalRevenue)}</strong><small>Lãi ${money(audit.totalProfit)}</small></div></div><details class="details"><summary>Xem ${audit.lines.length} mặt hàng đã kiểm</summary><div class="order-items">${audit.lines.map(line => `<div><span>${escapeHtml(line.name)} · tồn ${number(line.openingStock)} → ${number(line.endingStock)} · bán ${number(line.soldQty)}</span><strong>${money(line.revenue)}</strong></div>`).join("")}</div><div class="inline-actions"><button class="button small secondary edit-weekly" type="button">Chỉnh sửa chi tiết</button><button class="button small danger delete-weekly" type="button">Xóa đơn kiểm kho</button></div></details></article>`).join("") : "Chưa có dữ liệu kiểm kho.";
}
function beginEditWeekly(auditId) {
  const audit = state.weeklyAudits.find(item => item.id === auditId);
  if (!audit) return toast("Không tìm thấy đơn kiểm kho.", true);
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
  const button = event.target.closest(".quick-product"); if (!button) return;
  if (event.target.closest(".quick-selected-remove")) { state.cart = state.cart.filter(x => x.id !== button.dataset.id); return renderCart(); }
  addProductToCart(button.dataset.id);
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
$("#customer-sort")?.addEventListener("change", renderCustomers);
$("#debt-date-from").addEventListener("change", renderCustomers);
$("#debt-date-to").addEventListener("change", renderCustomers);
$("#clear-debt-dates").addEventListener("click", () => { $("#debt-date-from").value=""; $("#debt-date-to").value=""; renderCustomers(); });
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
    const paymentEntry = event.target.closest(".payment-entry");
    if (debtEntry && paymentEntry && event.target.closest(".save-payment")) {
      const payload={date:paymentEntry.querySelector(".edit-payment-date").value,amount:paymentEntry.querySelector(".edit-payment-amount").value,note:paymentEntry.querySelector(".edit-payment-note").value};
      await api(`/api/debts/${debtEntry.dataset.debtId}/payments/${paymentEntry.dataset.paymentId}`,{method:"PATCH",body:JSON.stringify(payload)});
      toast("Đã chỉnh chi tiết lần trả nợ."); await Promise.all([loadCustomers(),loadDashboard()]); return;
    }
    if (debtEntry && paymentEntry && event.target.closest(".delete-payment")) {
      if(!confirm("Xóa lần thanh toán này? Số tiền sẽ được cộng lại vào còn nợ."))return;
      await api(`/api/debts/${debtEntry.dataset.debtId}/payments/${paymentEntry.dataset.paymentId}`,{method:"DELETE"});
      toast("Đã xóa lần trả nợ."); await Promise.all([loadCustomers(),loadDashboard()]); return;
    }
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
    const result = await sendAssistantMessage(message);
    loading.textContent = result.answer;
  } catch (error) { loading.textContent = `Lỗi: ${error.message}`; }
  box.scrollTop = box.scrollHeight;
});


async function loadStores(){
  const data=await api("/api/stores"); state.stores=data.stores||[]; state.activeStoreId=data.activeStoreId||"";
  const select=$("#store-select"); if(select){select.innerHTML=state.stores.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");select.value=state.activeStoreId;}
  const box=$("#stores-list"); if(box)box.innerHTML=state.stores.map(s=>`<article class="store-card ${s.id===state.activeStoreId?"active":""}" data-id="${s.id}"><div><strong>${escapeHtml(s.name)}</strong><small>${s.counts.products} mặt hàng · ${s.counts.sales} đơn · ${s.counts.customers} khách</small></div><div class="inline-actions">${s.id===state.activeStoreId?'<span class="badge">Đang dùng</span>':'<button class="button small secondary select-store" type="button">Mở</button>'}<button class="button small rename-store" type="button">Đổi tên</button>${state.stores.length>1?'<button class="button small danger delete-store" type="button">Xóa</button>':''}</div></article>`).join("");
}
async function switchStore(id){ if(!id||id===state.activeStoreId)return; await api("/api/stores/select",{method:"POST",body:JSON.stringify({id})}); state.cart=[];state.editingSaleId="";state.editingAuditId="";await loadStores();await initAppData();toast("Đã chuyển cửa hàng."); }
async function createStore(){const name=prompt("Tên cửa hàng mới:","Cửa hàng mới");if(!name?.trim())return;await api("/api/stores",{method:"POST",body:JSON.stringify({name:name.trim()})});state.cart=[];await loadStores();await initAppData();toast(`Đã tạo ${name.trim()} với dữ liệu trắng.`);}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
async function getBackup(){const r=await fetch("/api/export/backup.json",{cache:"no-store"});if(!r.ok)throw new Error("Không tải được dữ liệu.");return r.json();}
function workbookFromBackup(data){
  const wb=XLSX.utils.book_new(); const sheets={
    San_pham:(data.products||[]).map(x=>({...x})),
    Khach_hang:(data.customers||[]).map(x=>({...x})),
    Cong_no:(data.debts||[]).map(x=>({...x,payments:JSON.stringify(x.payments||[])})),
    Don_hang:(data.sales||[]).map(x=>({...x,items:JSON.stringify(x.items||[])})),
    Kiem_kho:(data.weeklyAudits||[]).map(x=>({...x,lines:JSON.stringify(x.lines||[])}))
  };
  for(const [name,rows] of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),name.slice(0,31)); return wb;
}
function parseJsonCells(rows,keys){return rows.map(r=>{for(const k of keys)if(typeof r[k]==="string"&&r[k].trim().startsWith("[")){try{r[k]=JSON.parse(r[k]);}catch{}}return r;});}
function backupFromWorkbook(wb){
  const rows=name=>wb.Sheets[name]?XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:""}):[];
  return {products:rows("San_pham"),customers:rows("Khach_hang"),debts:parseJsonCells(rows("Cong_no"),["payments"]),sales:parseJsonCells(rows("Don_hang"),["items"]),weeklyTemplate:[],weeklyAudits:parseJsonCells(rows("Kiem_kho"),["lines"]),stockAdjustments:[]};
}
async function readImportFile(file){
  const name=file.name.toLowerCase();
  if(name.endsWith(".json"))return JSON.parse(await file.text());
  if(name.endsWith(".xlsx")||name.endsWith(".xls")){const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});return backupFromWorkbook(wb);}
  if(name.endsWith(".zip")){const zip=await JSZip.loadAsync(await file.arrayBuffer());const json=Object.values(zip.files).find(f=>!f.dir&&/backup.*\.json$/i.test(f.name))||Object.values(zip.files).find(f=>!f.dir&&/\.json$/i.test(f.name));if(json)return JSON.parse(await json.async("text"));const xf=Object.values(zip.files).find(f=>!f.dir&&/\.xlsx?$/i.test(f.name));if(xf){const wb=XLSX.read(await xf.async("arraybuffer"),{type:"array"});return backupFromWorkbook(wb);}throw new Error("ZIP không có JSON/Excel để nhập.");}
  throw new Error("Định dạng tệp chưa được hỗ trợ.");
}
async function importFile(file,mode="replace") {const data=await readImportFile(file);const result=await api("/api/import/backup",{method:"POST",body:JSON.stringify({data,mode})});await initAppData();await loadStores();return result;}
async function sendAssistantMessage(message){const result=await api("/api/ai/chat",{method:"POST",body:JSON.stringify({message})});if(result.mode==="action")await Promise.all([loadProducts(),loadDashboard(),loadSales()]);return result;}

async function initAppData() {
  $("#sale-date").value = todayKey();
  await Promise.all([loadProducts(), loadCustomers(), loadDashboard(), loadSales()]);
  renderCart();
  setDefaultWeek();
}

async function init() {
  try {
    await loadHealth();
    await loadStores();
    await initAppData();
  } catch (error) { toast(error.message, true); }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
}


$("#store-select").addEventListener("change",e=>switchStore(e.target.value));
$("#new-store").addEventListener("click",createStore); $("#new-store-2").addEventListener("click",createStore);
$("#go-data").addEventListener("click",()=>navigateTo("data"));
$("#stores-list").addEventListener("click",async e=>{const card=e.target.closest(".store-card");if(!card)return;try{if(e.target.closest(".select-store"))return switchStore(card.dataset.id);if(e.target.closest(".rename-store")){const cur=state.stores.find(s=>s.id===card.dataset.id);const name=prompt("Tên cửa hàng:",cur?.name||"");if(name?.trim()){await api(`/api/stores/${card.dataset.id}`,{method:"PATCH",body:JSON.stringify({name:name.trim()})});await loadStores();}}if(e.target.closest(".delete-store")){if(!confirm("Xóa cửa hàng này và toàn bộ dữ liệu bên trong?"))return;await api(`/api/stores/${card.dataset.id}`,{method:"DELETE"});await loadStores();await initAppData();}}catch(err){toast(err.message,true);}});
$("#export-json").addEventListener("click",async()=>{try{const data=await getBackup();downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),`cantin-${todayKey()}.json`);}catch(e){toast(e.message,true);}});
$("#export-excel").addEventListener("click",async()=>{try{const data=await getBackup(),wb=workbookFromBackup(data);XLSX.writeFile(wb,`cantin-${todayKey()}.xlsx`);}catch(e){toast(e.message,true);}});
$("#export-zip").addEventListener("click",async()=>{try{const data=await getBackup(),zip=new JSZip();zip.file(`cantin-backup-${todayKey()}.json`,JSON.stringify(data,null,2));const wb=workbookFromBackup(data),bytes=XLSX.write(wb,{bookType:"xlsx",type:"array"});zip.file(`cantin-${todayKey()}.xlsx`,bytes);const blob=await zip.generateAsync({type:"blob"});downloadBlob(blob,`cantin-${todayKey()}.zip`);}catch(e){toast(e.message,true);}});
$("#import-data").addEventListener("click",async()=>{const file=$("#data-import-file").files[0];if(!file)return toast("Hãy chọn tệp cần nhập.",true);if($("#import-mode").value==="replace"&&!confirm("Thay toàn bộ dữ liệu cửa hàng hiện tại bằng tệp này?"))return;const box=$("#import-result");box.classList.remove("hidden");box.textContent="Đang đọc tệp…";try{const r=await importFile(file,$("#import-mode").value);box.textContent=`Đã nhập: ${r.counts.products} mặt hàng, ${r.counts.customers} khách, ${r.counts.debts} khoản nợ, ${r.counts.sales} đơn.`;toast("Nhập dữ liệu thành công.");}catch(e){box.textContent=`Lỗi: ${e.message}`;toast(e.message,true);}});
$("#assistant-upload-button").addEventListener("click",()=>$("#assistant-file").click());
$("#assistant-file").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;const box=$("#assistant-file-result");box.classList.remove("hidden");try{if(file.type.startsWith("image/")){box.innerHTML="Đang OCR hình ảnh… Có thể mất 10–30 giây.";const r=await Tesseract.recognize(file,"vie+eng",{logger:m=>{if(m.status==="recognizing text")box.textContent=`Đang đọc ảnh ${Math.round((m.progress||0)*100)}%…`;}});const text=(r.data.text||"").trim();box.innerHTML=`<strong>Văn bản nhận được:</strong><textarea id="ocr-text">${escapeHtml(text)}</textarea><button class="button small" id="apply-ocr" type="button">AI phân tích & cập nhật kho</button>`;$("#apply-ocr").addEventListener("click",async()=>{const lines=$("#ocr-text").value.split(/\n+/).map(x=>x.trim()).filter(Boolean);let answers=[];for(const line of lines.slice(0,80)){const rr=await sendAssistantMessage(line);if(rr.mode==="action")answers.push(rr.answer);}box.insertAdjacentHTML("beforeend",`<p class="hint">${answers.length?answers.map(escapeHtml).join("<br>"):"AI chưa nhận ra lệnh kho rõ ràng. Hãy chỉnh văn bản thành dạng “Pepsi còn 10”, “nhập 2 thùng Rockstar”…"}</p>`);});}else{box.textContent="Đang phân tích tệp dữ liệu…";const r=await importFile(file,"merge");box.textContent=`AI đã đọc và gộp dữ liệu: ${r.counts.products} mặt hàng, ${r.counts.customers} khách, ${r.counts.sales} đơn.`;}}catch(err){box.textContent=`Lỗi: ${err.message}`;}});

init();
function formatMoneyInput(value){return Math.round(Number(value)||0).toLocaleString("vi-VN");}
function evalMoneyExpression(raw,current=0){
  let s=String(raw??"").trim().replace(/\s/g,"");
  if(!s)return 0;
  const op=s[0], isOp="+-*/×÷".includes(op);
  const clean=x=>Number(String(x).replace(/\./g,"").replace(/,/g,"."))||0;
  if(isOp){const n=clean(s.slice(1)); if(op==="+")return current+n;if(op==="-")return current-n;if(op==="*"||op==="×")return current*n;if(op==="/"||op==="÷")return n?current/n:current;}
  return clean(s);
}
function bindMoneyInputs(scope=document){
  scope.querySelectorAll(".money-input").forEach(input=>{
    if(input.dataset.moneyBound)return; input.dataset.moneyBound="1";
    input.dataset.base=String(evalMoneyExpression(input.value,0));
    input.addEventListener("focus",()=>{input.dataset.base=String(evalMoneyExpression(input.value,0));input.select();});
    input.addEventListener("blur",()=>{const v=Math.max(0,Math.round(evalMoneyExpression(input.value,Number(input.dataset.base)||0)));input.value=formatMoneyInput(v);input.dataset.base=String(v);});
  });
}
function moneyValue(input){return Math.max(0,Math.round(evalMoneyExpression(input?.value||"0",Number(input?.dataset?.base)||0)));}

