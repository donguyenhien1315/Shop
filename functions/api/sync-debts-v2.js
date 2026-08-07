const SUPABASE_URL = "https://kqfqdxmhrsndrgyipybe.supabase.co";
const SUPABASE_KEY = "sb_publishable_vLPh3dz8y3jHDcXtg1JmgQ_nJF2WdUF";

// Đọc bộ công nợ chuẩn đã đóng gói trong sync-debts.js hiện có trên repo.
const RAW_SYNC_SOURCE =
  "https://raw.githubusercontent.com/donguyenhien1315/Shop/refs/heads/main/functions/api/sync-debts.js";

async function supabaseRpc(name, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_KEY
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Supabase ${name} lỗi ${res.status}: ${text}`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readCanonicalDebtData() {
  const res = await fetch(RAW_SYNC_SOURCE, {
    headers: { "cache-control": "no-cache" }
  });

  if (!res.ok) {
    throw new Error(`Không đọc được dữ liệu công nợ chuẩn (${res.status}).`);
  }

  const source = await res.text();

  // sync-debts.js đang chứa payload gzip+base64 trong const B="..."
  const match = source.match(/const\s+B\s*=\s*"([^"]+)"/);

  if (!match) {
    throw new Error("Không tìm thấy gói dữ liệu công nợ chuẩn trong sync-debts.js.");
  }

  const base64 = match[1];
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));

  const canonical = JSON.parse(await new Response(stream).text());

  if (!Array.isArray(canonical.customers) || !Array.isArray(canonical.debts)) {
    throw new Error("Gói dữ liệu nguồn không có customers/debts hợp lệ.");
  }

  return {
    customers: canonical.customers,
    debts: canonical.debts
  };
}

function getActiveStoreData(root) {
  if (root && root.__multiStore === true && Array.isArray(root.stores)) {
    const store =
      root.stores.find(s => s.id === root.activeStoreId) ||
      root.stores[0];

    if (!store) {
      throw new Error("Không tìm thấy cửa hàng đang hoạt động.");
    }

    if (!store.data || typeof store.data !== "object") {
      store.data = {};
    }

    return store.data;
  }

  return root;
}

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);

    if (url.searchParams.get("confirm") !== "sync-cantin-v2") {
      return Response.json(
        { ok: false, error: "confirm required" },
        { status: 400 }
      );
    }

    const canonical = await readCanonicalDebtData();

    let root = await supabaseRpc("cantin_read_store_public");

    if (!root || typeof root !== "object") {
      root = {};
    }

    const target = getActiveStoreData(root);

    // CHỈ thay khách hàng + công nợ.
    // Không đụng sản phẩm, bán hàng, tồn kho, kiểm kho.
    target.customers = structuredClone(canonical.customers);
    target.debts = structuredClone(canonical.debts);

    target.meta = {
      ...(target.meta || {}),
      canonicalDebtSyncVersion: "cantin-v2-sync-v2-2026-08-08",
      canonicalDebtSyncAt: new Date().toISOString(),
      canonicalDebtSource: "Cantin AI v2 / Sổ nợ nguồn"
    };

    await supabaseRpc("cantin_write_store_public", {
      p_data: root
    });

    const totalDebt = canonical.debts.reduce(
      (sum, debt) => sum + (Number(debt.balance) || 0),
      0
    );

    return Response.json({
      ok: true,
      customers: canonical.customers.length,
      debts: canonical.debts.length,
      totalDebt,
      message: "Đã đồng bộ công nợ trực tiếp vào Supabase."
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}
