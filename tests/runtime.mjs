import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const temporary = await mkdtemp(path.join(tmpdir(), "jigz-runtime-"));
const bundlePath = path.join(temporary, "worker.mjs");

await build({ entryPoints: [path.join(root, "src/index.js")], bundle: true, format: "esm", platform: "browser", target: "es2022", outfile: bundlePath, logLevel: "silent" });
const bundle = await readFile(bundlePath, "utf8");
assert.match(bundle, /scheduled_maintenance/, "Worker bundle must include scheduled maintenance");
const worker = (await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`)).default;

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { const statement = new D1Statement(this.database, this.sql); statement.values = values.map((value) => value === undefined ? null : value); return statement; }
  async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] : row) : null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: {} }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class D1Database {
  constructor() { this.database = new DatabaseSync(":memory:"); this.database.exec("PRAGMA foreign_keys=ON"); }
  prepare(sql) { return new D1Statement(this.database, sql); }
  async exec(sql) { this.database.exec(sql); return { count: 1, duration: 0 }; }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

const db = new D1Database();
const assets = { fetch: async () => new Response("asset", { status: 200 }) };
const env = { DB: db, ASSETS: assets, ADMIN_ACCESS_REQUIRED: "false" };
const origin = "https://jigz.test";
let cookie = "";

const request = async (pathname, init = {}, targetEnv = env) => {
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set("cookie", cookie);
  if (init.method && init.method !== "GET") headers.set("origin", origin);
  const waits = [];
  const response = await worker.fetch(new Request(`${origin}${pathname}`, { ...init, headers }), targetEnv, { waitUntil: (promise) => waits.push(Promise.resolve(promise)) });
  await Promise.allSettled(waits);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
};
const json = async (pathname, init = {}, targetEnv = env) => { const response = await request(pathname, init, targetEnv); return { response, body: await response.json() }; };

const health = await json("/api/health");
assert.equal(health.response.status, 200);
assert.equal(health.body.ok, true);
assert.equal(health.body.database, "connected");
assert.equal(health.body.version, "5.7.0");

const session = await json("/api/session");
assert.equal(session.response.status, 200);
assert.equal(session.body.user.role, "CUSTOMER");
assert.match(cookie, /^jigz_sid=/);

const catalog = await json("/api/products");
assert.equal(catalog.response.status, 200);
const product = catalog.body.products.find((item) => Number(item.stock) >= 2 && Object.keys(item.prices || {}).length);
assert.ok(product, `Seed catalog must contain an orderable product: ${JSON.stringify(catalog.body.products.slice(0, 3))}`);
const packSize = Number(Object.keys(product.prices).sort((a, b) => Number(a) - Number(b))[0]);
const stockBefore = Number(product.stock);
const payload = { customerName: "Runtime Tester", phone: "0812345678", address: "Bangkok 10110", paymentMethod: "TRANSFER", complianceAccepted: true, idempotencyKey: `runtime:${crypto.randomUUID()}`, items: [{ productId: product.id, packSize, qty: 1 }] };
const postOrder = () => json("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const create = await postOrder();
assert.equal(create.response.status, 201, JSON.stringify(create.body));
assert.ok(create.body.order.id);
assert.ok(create.body.order.reservation_expires_at);

const duplicate = await postOrder();
assert.equal(duplicate.response.status, 201, JSON.stringify(duplicate.body));
assert.equal(duplicate.body.order.id, create.body.order.id);
const afterDuplicate = await json("/api/products");
assert.equal(Number(afterDuplicate.body.products.find((item) => item.id === product.id).stock), stockBefore - packSize, "Duplicate request must not deduct stock twice");

await db.prepare("UPDATE sales_orders SET reservation_expires_at=datetime('now','-1 minute') WHERE id=?").bind(create.body.order.id).run();
await json("/api/products");
const expired = await json(`/api/orders/${encodeURIComponent(create.body.order.id)}`);
assert.equal(expired.body.order.status, "CANCELLED", "Expired reservation must cancel automatically");
const afterExpiry = await json("/api/products");
assert.equal(Number(afterExpiry.body.products.find((item) => item.id === product.id).stock), stockBefore, "Expired reservation must return stock");

const adminSession = await json("/api/admin/session");
assert.equal(adminSession.response.status, 200);
assert.equal(adminSession.body.user.role, "OWNER");
const adminHealth = await json("/api/admin/system-health");
assert.equal(adminHealth.response.status, 200);
assert.equal(adminHealth.body.ok, true);
const backup = await request("/api/admin/backup");
assert.equal(backup.status, 200);
assert.match(backup.headers.get("content-disposition") || "", /jigz-backup-/);
const backupBody = await backup.json();
assert.equal(backupBody.schemaVersion, "5.7.0");
assert.ok(Array.isArray(backupBody.auditLogs));

const protectedEnv = { DB: db, ASSETS: assets, ADMIN_ACCESS_REQUIRED: "true", TEAM_DOMAIN: "https://example.cloudflareaccess.com", POLICY_AUD: "runtime-audience" };
assert.equal((await request("/api/admin/session", {}, protectedEnv)).status, 401);
assert.equal((await request("/admin", {}, protectedEnv)).status, 401);

console.log(JSON.stringify({ ok: true, version: health.body.version, tested: ["D1 initialization", "device session", "order creation", "idempotent retry", "stock deduction", "reservation expiry", "stock restoration", "owner bootstrap", "health center", "backup export", "Cloudflare Access denial"] }, null, 2));
