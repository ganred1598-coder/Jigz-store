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
      for (const statement of statements) results.push(/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(statement.sql) ? await statement.all() : await statement.run());
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
assert.equal(health.body.version, "5.14.0");
const googleVerification=await request("/googlea735a29242109529.html");
assert.equal(googleVerification.status,200);
assert.equal(await googleVerification.text(),"google-site-verification: googlea735a29242109529.html");
const sitemap=await request("/sitemap.xml");
assert.equal(sitemap.status,200);
assert.match(sitemap.headers.get("content-type")||"",/application\/xml/);
assert.match(await sitemap.text(),/<loc>https:\/\/jigz\.test\/<\/loc>/);
const robots=await request("/robots.txt");
assert.equal(robots.status,200);
const robotsText=await robots.text();
assert.match(robotsText,/Disallow: \/admin/);
assert.match(robotsText,/Sitemap: https:\/\/jigz\.test\/sitemap\.xml/);

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
const payload = { customerName: "Runtime Tester", phone: "0812345678", address: "Bangkok 10110", paymentMethod: "TRANSFER", complianceAccepted: true, idempotencyKey: `runtime:${crypto.randomUUID()}`, items: [{ productId: product.id, packSize, qty: 1, salePrice: 0.01 }] };
const postOrder = () => json("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const create = await postOrder();
assert.equal(create.response.status, 201, JSON.stringify(create.body));
assert.ok(create.body.order.id);
assert.ok(create.body.order.reservation_expires_at);
assert.equal(Number(create.body.order.items[0].line_total), Number(product.prices[String(packSize)]), "Customer checkout must ignore POS-only sale price");

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
const initialOwnerCookie=cookie;
cookie="";
const accessDevice=await json("/api/session");
assert.equal(accessDevice.body.user.role,"CUSTOMER");
const accessDeviceCookie=cookie;
cookie=initialOwnerCookie;
const creditCode="JIGZ-RUNTIME-9137",creditLimit=10000;
const createCredit=await json("/api/admin/credit-accounts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({userId:accessDevice.body.user.id,creditorName:"Runtime Owner",creditLimit,code:creditCode})});
assert.equal(createCredit.response.status,201,JSON.stringify(createCredit.body));
assert.equal(createCredit.body.code,creditCode,"Full credit code must be returned once to OWNER");
const creditOrderPayload={customerName:"Credit Customer",phone:"0899999999",address:"Bangkok 10110",paymentMethod:"CREDIT",creditCode,complianceAccepted:true,idempotencyKey:`credit:${crypto.randomUUID()}`,items:[{productId:product.id,packSize,qty:1}]};
const wrongCredit=await json("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...creditOrderPayload,idempotencyKey:`credit:${crypto.randomUUID()}`})});
assert.equal(wrongCredit.response.status,400);
assert.equal(wrongCredit.body.error,"credit_not_authorized","Credit code must not work for another user");
cookie=accessDeviceCookie;
const creditBefore=await json("/api/credit");
assert.equal(Number(creditBefore.body.credit.available_balance),creditLimit);
const creditOrder=await json("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(creditOrderPayload)});
assert.equal(creditOrder.response.status,201,JSON.stringify(creditOrder.body));
assert.equal(creditOrder.body.order.payment_method,"CREDIT");
assert.equal(creditOrder.body.order.creditor_name,"Runtime Owner");
assert.equal(creditOrder.body.order.status,"ACCEPTED");
const creditAfter=await json("/api/credit");
assert.equal(Number(creditAfter.body.credit.available_balance),creditLimit-Number(creditOrder.body.order.total),"Credit balance must be deducted with the order");
cookie=initialOwnerCookie;
const cancelCredit=await json(`/api/admin/orders/${encodeURIComponent(creditOrder.body.order.id)}/transition`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:"CANCELLED"})});
assert.equal(cancelCredit.response.status,200,JSON.stringify(cancelCredit.body));
cookie=accessDeviceCookie;
const creditRefunded=await json("/api/credit");
assert.equal(Number(creditRefunded.body.credit.available_balance),creditLimit,"Cancelling an order must restore store credit");
const accessRequest=await json("/api/admin/access-request",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
assert.equal(accessRequest.response.status,202,JSON.stringify(accessRequest.body));
assert.equal(accessRequest.body.request.status,"PENDING");
const accessStatus=await json("/api/admin/access-request");
assert.equal(accessStatus.body.authorized,false);
assert.equal(accessStatus.body.request.status,"PENDING");
cookie=initialOwnerCookie;
const staffAccess=await json("/api/admin/staff");
const pendingAccess=staffAccess.body.accessRequests.find(item=>item.user_id===accessDevice.body.user.id);
assert.ok(pendingAccess,"OWNER must see pending device access request");
const approvedAccess=await json(`/api/admin/access-requests/${encodeURIComponent(pendingAccess.id)}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:"APPROVED"})});
assert.equal(approvedAccess.response.status,200,JSON.stringify(approvedAccess.body));
cookie=accessDeviceCookie;
const approvedDeviceSession=await json("/api/admin/session");
assert.equal(approvedDeviceSession.response.status,200);
assert.equal(approvedDeviceSession.body.user.role,"ADMIN");
cookie=initialOwnerCookie;
const salesCode = "AUTOSELL";
const createSalesAgent = await json("/api/admin/agents", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: salesCode, name: "Runtime Sales", agentType: "SALES", commissionRate: 10, userId: adminSession.body.user.id })
});
assert.equal(createSalesAgent.response.status, 200, JSON.stringify(createSalesAgent.body));
const linkedSession = await json("/api/admin/session");
assert.equal(linkedSession.body.salesAgent.code, salesCode);
await db.prepare("DELETE FROM inventory_lots WHERE product_id=?").bind(product.id).run();
await db.prepare("INSERT INTO inventory_lots(product_id,received_qty,remaining_qty,unit_cost,note) VALUES(?,?,?,?,?)").bind(product.id,100,100,2.5,"runtime cost").run();
const posSalePrice = 12.34;
const posOrder = await json("/api/admin/orders", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    customerName: "POS Price Tester",
    phone: "0811111111",
    address: "รับหน้าร้าน",
    paymentMethod: "CASH",
    agentCode: "WRONG-CODE",
    items: [{ productId: product.id, packSize, qty: 2, salePrice: posSalePrice }]
  })
});
assert.equal(posOrder.response.status, 201, JSON.stringify(posOrder.body));
assert.equal(posOrder.body.order.source, "POS");
assert.equal(posOrder.body.order.agent_code, salesCode, "Worker must assign the signed-in sales code");
assert.equal(Number(posOrder.body.order.items[0].line_total), posSalePrice * 2);
assert.equal(Number(posOrder.body.order.items[0].unit_price) * packSize, posSalePrice);
assert.equal(Number(posOrder.body.order.items[0].actual_cost), 2.5 * packSize * 2, JSON.stringify(posOrder.body.order.items[0]));
const codShipping = 45;
const codSalePrice = 20;
const codTotal = codSalePrice + codShipping;
const posCodOrder = await json("/api/admin/orders", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    customerName: "POS COD Tester",
    phone: "0833333333",
    address: "ส่งปลายทาง",
    paymentMethod: "COD",
    shippingFee: codShipping,
    codAmount: codTotal + 10,
    items: [{ productId: product.id, packSize, qty: 1, salePrice: codSalePrice }]
  })
});
assert.equal(posCodOrder.response.status, 201, JSON.stringify(posCodOrder.body));
assert.equal(posCodOrder.body.order.status, "NEW", "POS COD must not be marked paid before collection");
assert.equal(Number(posCodOrder.body.order.shipping_fee), codShipping);
assert.equal(Number(posCodOrder.body.order.total), codTotal);
assert.equal(Number(posCodOrder.body.order.cod_amount), codTotal + 10);
const posCreditOptions=await json("/api/admin/credit-options");
const posCreditOption=posCreditOptions.body.accounts.find(item=>item.user_id===accessDevice.body.user.id);
assert.ok(posCreditOption,"POS must list credit users from system data");
const posCreditTotal=Number(product.prices[String(packSize)]);
const posCreditOrder=await json("/api/admin/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({customerName:"POS Credit Customer",phone:"0899999999",address:"ส่งตามโปรไฟล์",paymentMethod:"CREDIT",creditAccountId:posCreditOption.id,creditAmount:posCreditTotal,items:[{productId:product.id,packSize,qty:1}]})});
assert.equal(posCreditOrder.response.status,201,JSON.stringify(posCreditOrder.body));
assert.equal(posCreditOrder.body.order.payment_method,"CREDIT");
assert.equal(posCreditOrder.body.order.source,"POS");
assert.equal(posCreditOrder.body.order.user_id,accessDevice.body.user.id);
assert.equal(posCreditOrder.body.order.status,"ACCEPTED");
assert.equal(Number(posCreditOrder.body.order.credit_amount),posCreditTotal);
assert.ok(posCreditOrder.body.order.credit_due_at,"POS credit must have a due date");
await db.prepare("UPDATE sales_orders SET credit_due_at=datetime('now','-1 minute') WHERE id=?").bind(posCreditOrder.body.order.id).run();
const overdueHealth=await json("/api/admin/system-health");
assert.ok(Number(overdueHealth.body.checks.overdueCreditOrders)>=1,"Credit must alert after the due date");
assert.ok(overdueHealth.body.alerts.some(item=>item.alert_type==="CREDIT_OVERDUE"&&item.entity_id===posCreditOrder.body.order.id));
const settleCredit=await json(`/api/admin/orders/${encodeURIComponent(posCreditOrder.body.order.id)}/credit-settled`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
assert.equal(settleCredit.response.status,200,JSON.stringify(settleCredit.body));
assert.ok(settleCredit.body.order.credit_settled_at);
const settledBalance=Number((await db.prepare("SELECT available_balance FROM credit_accounts WHERE id=?").bind(posCreditOption.id).first()).available_balance);
assert.equal(settledBalance,creditLimit,"Credit settlement must restore the available limit");
const cancelSettledCredit=await json(`/api/admin/orders/${encodeURIComponent(posCreditOrder.body.order.id)}/transition`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:"CANCELLED"})});
assert.equal(cancelSettledCredit.response.status,200,JSON.stringify(cancelSettledCredit.body));
assert.equal(Number((await db.prepare("SELECT available_balance FROM credit_accounts WHERE id=?").bind(posCreditOption.id).first()).available_balance),creditLimit,"Cancelling a settled credit order must not restore credit twice");
const thaiOrderDay=new Date(new Date(String(posCodOrder.body.order.created_at).replace(" ","T")+"Z").getTime()+7*3600000).toISOString().slice(0,10);
const filteredOrders=await json(`/api/admin/orders?from=${thaiOrderDay}&to=${thaiOrderDay}&payment=COD&source=POS&q=${encodeURIComponent(posCodOrder.body.order.id)}`);
assert.equal(filteredOrders.response.status,200,JSON.stringify(filteredOrders.body));
assert.equal(filteredOrders.body.orders.length,1,"Order date/payment/source/search filters must intersect");
assert.equal(filteredOrders.body.orders[0].id,posCodOrder.body.order.id);
const invalidOrderRange=await json("/api/admin/orders?from=2026-12-31&to=2026-01-01");
assert.equal(invalidOrderRange.response.status,400);
assert.equal(invalidOrderRange.body.error,"invalid_date_range");
const commission = await db.prepare("SELECT commission_rate,profit_base,commission_amount,status FROM sales_commissions WHERE order_id=?").bind(posOrder.body.order.id).first();
const expectedProfit = Math.max(0,posSalePrice*2-2.5*packSize*2);
assert.equal(Number(commission.commission_rate),10);
assert.ok(Math.abs(Number(commission.profit_base)-expectedProfit)<0.0001);
assert.ok(Math.abs(Number(commission.commission_amount)-expectedProfit*.1)<0.0001);
assert.equal(commission.status,"PENDING");
const mySales = await json("/api/admin/sales/me");
assert.equal(mySales.response.status,200,JSON.stringify(mySales.body));
assert.equal(mySales.body.agent.code,salesCode);
assert.ok(mySales.body.summary.orders>=1,JSON.stringify(mySales.body));
assert.ok(mySales.body.summary.pendingCommission>=Number(commission.commission_amount));
const myPosBill=mySales.body.orders.find(item=>item.id===posOrder.body.order.id);
assert.ok(myPosBill,"Sales workspace must include the signed-in sales bill");
assert.equal(Number(myPosBill.commission_amount),Number(commission.commission_amount));
const productsAfterPos = await json("/api/admin/products");
const unchangedProduct = productsAfterPos.body.products.find((item) => item.id === product.id);
assert.equal(Number(unchangedProduct.prices[String(packSize)]), Number(product.prices[String(packSize)]), "POS override must not change catalog price");
const overrideAudit = await db.prepare("SELECT details_json FROM audit_logs WHERE action='CREATE_ORDER' AND entity_id=?").bind(posOrder.body.order.id).first();
assert.equal(JSON.parse(overrideAudit.details_json).posPriceOverrides[0].salePrice, posSalePrice);
const ownerCookie=cookie;
cookie="";
const salesPublicSession=await json("/api/session");
const restrictedSalesUser=salesPublicSession.body.user;
const restrictedSalesCookie=cookie;
await db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").bind(restrictedSalesUser.id).run();
cookie=ownerCookie;
const restrictedSalesCode="SALES002";
const secondSalesAgent=await json("/api/admin/agents",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:restrictedSalesCode,name:"Restricted Sales",agentType:"SALES",commissionRate:8,userId:restrictedSalesUser.id})});
assert.equal(secondSalesAgent.response.status,200,JSON.stringify(secondSalesAgent.body));
cookie=restrictedSalesCookie;
const restrictedSession=await json("/api/admin/session");
assert.equal(restrictedSession.body.effectiveRole,"SALES");
assert.equal(restrictedSession.body.salesAgent.code,restrictedSalesCode);
assert.equal((await json("/api/admin/summary")).response.status,403,"Sales must not access the global dashboard API");
assert.equal((await json("/api/admin/products")).response.status,200,"Sales may load products for POS");
const stockBeforeApproval=Number((await json("/api/admin/products")).body.products.find(item=>item.id===product.id).stock);
const approvalRequest=await json("/api/admin/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({customerName:"Approval Tester",phone:"0822222222",address:"รับหน้าร้าน",paymentMethod:"CASH",discount:0,items:[{productId:product.id,packSize,qty:1,salePrice:.01}]})});
assert.equal(approvalRequest.response.status,202,JSON.stringify(approvalRequest.body));
assert.equal(approvalRequest.body.approvalRequired,true);
assert.ok(approvalRequest.body.quote.discountPercent>10);
assert.equal(Number((await json("/api/admin/products")).body.products.find(item=>item.id===product.id).stock),stockBeforeApproval,"Approval request must not reserve or deduct stock");
cookie=ownerCookie;
const approvalResult=await json(`/api/admin/approvals/${encodeURIComponent(approvalRequest.body.approvalId)}/review`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status:"APPROVED",note:"runtime approval"})});
assert.equal(approvalResult.response.status,200,JSON.stringify(approvalResult.body));
assert.ok(approvalResult.body.orderId);
const approvedOrder=await json(`/api/admin/orders/${encodeURIComponent(approvalResult.body.orderId)}`);
assert.equal(approvedOrder.body.order.agent_code,restrictedSalesCode);
assert.equal(Number(approvedOrder.body.order.items[0].line_total),.01);
const moveOrder=async(id,status,extra={})=>json(`/api/admin/orders/${encodeURIComponent(id)}/transition`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({status,...extra})});
await moveOrder(posOrder.body.order.id,"PACKING");
await moveOrder(posOrder.body.order.id,"PACKED");
const rolledBackPacking=await moveOrder(posOrder.body.order.id,"PACKING",{reason:"ตรวจพบว่าต้องแพ็กใหม่"});
assert.equal(rolledBackPacking.response.status,200,JSON.stringify(rolledBackPacking.body));
assert.equal(rolledBackPacking.body.order.status,"PACKING");
const rollbackAudit=await db.prepare("SELECT action,details_json FROM audit_logs WHERE entity_id=? ORDER BY id DESC LIMIT 1").bind(posOrder.body.order.id).first();
assert.equal(rollbackAudit.action,"ROLLBACK_PACKING_STATUS");
assert.equal(JSON.parse(rollbackAudit.details_json).reason,"ตรวจพบว่าต้องแพ็กใหม่");
await moveOrder(posOrder.body.order.id,"PACKED");
await moveOrder(posOrder.body.order.id,"SHIPPED",{trackingCompany:"TEST",trackingNumber:"TRACK001"});
await moveOrder(posOrder.body.order.id,"COMPLETED");
const firstRelease=await json("/api/admin/commissions/release",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
assert.ok(firstRelease.body.paid>=1);
const paidCommission=await db.prepare("SELECT id,commission_amount,status FROM sales_commissions WHERE order_id=?").bind(posOrder.body.order.id).first();
assert.equal(paidCommission.status,"PAID");
const deletePaidOrder=await json(`/api/admin/orders/${encodeURIComponent(posOrder.body.order.id)}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({reason:"runtime return"})});
assert.equal(deletePaidOrder.response.status,200,JSON.stringify(deletePaidOrder.body));
const pendingReversal=await db.prepare("SELECT amount,status FROM wallet_transactions WHERE reference_type='COMMISSION_REVERSAL' AND reference_id=?").bind(String(paidCommission.id)).first();
assert.equal(pendingReversal.status,"PENDING");
assert.equal(Number(pendingReversal.amount),Number(paidCommission.commission_amount));
const adminHealth = await json("/api/admin/system-health");
assert.equal(adminHealth.response.status, 200);
assert.equal(adminHealth.body.ok, true);
const backup = await request("/api/admin/backup");
assert.equal(backup.status, 200);
assert.match(backup.headers.get("content-disposition") || "", /jigz-backup-/);
const backupBody = await backup.json();
assert.equal(backupBody.schemaVersion, "5.14.0");
assert.ok(Array.isArray(backupBody.creditAccounts));
assert.ok(Array.isArray(backupBody.creditTransactions));
assert.equal(Object.hasOwn(backupBody.creditAccounts[0] || {}, "code_hash"), false);
assert.ok(Array.isArray(backupBody.auditLogs));

const protectedEnv = { DB: db, ASSETS: assets, ADMIN_ACCESS_REQUIRED: "true", TEAM_DOMAIN: "https://example.cloudflareaccess.com", POLICY_AUD: "runtime-audience" };
assert.equal((await request("/api/admin/session", {}, protectedEnv)).status, 401);
assert.equal((await request("/admin", {}, protectedEnv)).status, 401);

console.log(JSON.stringify({ ok: true, version: health.body.version, tested: ["D1 initialization", "device session", "order creation", "idempotent retry", "stock deduction", "reservation expiry", "stock restoration", "owner bootstrap", "internal admin access request", "OWNER device approval", "linked sales session", "automatic sales attribution", "sales self workspace", "SALES permission boundary", "POS price approval request", "OWNER price approval", "approval stock safety", "POS per-bill pricing", "order date/payment/source filters", "invalid date-range guard", "FIFO commission calculation", "paid commission reversal", "catalog price isolation", "price override audit", "health center", "backup export", "OWNER-created store credit", "credit user isolation", "credit balance deduction", "credit refund on cancellation", "Cloudflare Access denial"] }, null, 2));
