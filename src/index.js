import seedCatalog from "../public/products.json";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=30, stale-while-revalidate=120",
  "x-content-type-options": "nosniff",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

async function initializeDatabase(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'JIGz',
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      price REAL,
      prices_json TEXT NOT NULL DEFAULT '{}',
      stock REAL,
      images_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_products_status_category
      ON products(status, category, name);
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  const count = await db.prepare("SELECT COUNT(*) AS total FROM products").first();
  if (Number(count?.total || 0) > 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO products
      (id, name, brand, category, unit, price, prices_json, stock, images_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `);
  const statements = seedCatalog.products.map((product) =>
    insert.bind(
      product.id,
      product.name,
      product.brand || "JIGz",
      product.category,
      product.unit,
      product.price,
      JSON.stringify(product.prices || {}),
      product.stock,
      JSON.stringify(product.images || []),
    ),
  );
  if (statements.length) await db.batch(statements);
}

async function listProducts(db) {
  await initializeDatabase(db);
  const result = await db.prepare(`
    SELECT id, name, brand, category, unit, price, prices_json, stock, images_json
    FROM products
    WHERE status = 'ACTIVE'
    ORDER BY category COLLATE NOCASE, name COLLATE NOCASE
  `).all();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    unit: row.unit,
    price: row.price,
    prices: JSON.parse(row.prices_json || "{}"),
    stock: row.stock,
    images: JSON.parse(row.images_json || "[]"),
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        await env.DB.prepare("SELECT 1").first();
        return json({ ok: true, database: "connected" }, { headers: { "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/api/products") {
        return json({ products: await listProducts(env.DB) });
      }
      if (url.pathname.startsWith("/api/")) {
        return json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_failed", path: url.pathname, message: error instanceof Error ? error.message : String(error) }));
      return json({ error: "service_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  },
};
