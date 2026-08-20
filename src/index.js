import seedCatalog from "../public/products.json";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const enc=new TextEncoder();
function json(data,init={}){return new Response(JSON.stringify(data),{...init,headers:{...JSON_HEADERS,...(init.headers||{})}})}
function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
async function digest(value){return new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value)))}
async function sameSecret(a,b){const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0}
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(value))))}
async function issueSession(secret){const value=`${Date.now()+28800000}.${crypto.randomUUID()}`;return `${value}.${await sign(value,secret)}`}
async function validSession(request,secret){if(!secret)return false;const match=(request.headers.get("cookie")||"").match(/(?:^|;\s*)jigz_admin=([^;]+)/);if(!match)return false;const token=decodeURIComponent(match[1]),parts=token.split(".");if(parts.length!==3||Number(parts[0])<Date.now())return false;return sameSecret(parts[2],await sign(`${parts[0]}.${parts[1]}`,secret))}
function sameOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin}

async function initializeDatabase(db){
 await db.exec(`
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,brand TEXT NOT NULL DEFAULT 'JIGz',category TEXT NOT NULL,unit TEXT NOT NULL,price REAL,prices_json TEXT NOT NULL DEFAULT '{}',stock REAL,images_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_products_status_category ON products(status,category,name);
 CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id TEXT NOT NULL,movement_type TEXT NOT NULL,quantity REAL NOT NULL,note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE TABLE IF NOT EXISTS inventory_lots(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id TEXT NOT NULL,received_qty REAL NOT NULL,remaining_qty REAL NOT NULL,unit_cost REAL NOT NULL,supplier TEXT,note TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE INDEX IF NOT EXISTS idx_lots_fifo ON inventory_lots(product_id,received_at,id);
 CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,agent_type TEXT NOT NULL CHECK(agent_type IN ('RESELLER','SALES')),commission_rate REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_name TEXT,agent_code TEXT,subtotal REAL NOT NULL DEFAULT 0,discount REAL NOT NULL DEFAULT 0,shipping_subsidy REAL NOT NULL DEFAULT 0,payment_fee REAL NOT NULL DEFAULT 0,refund_amount REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'DRAFT',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,paid_at TEXT,completed_at TEXT,FOREIGN KEY(agent_code) REFERENCES agents(code));
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity REAL NOT NULL,unit_price REAL NOT NULL,actual_cost REAL NOT NULL DEFAULT 0,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE TABLE IF NOT EXISTS commissions(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL UNIQUE,agent_id INTEGER NOT NULL,revenue_net REAL NOT NULL,actual_cost REAL NOT NULL,deductions REAL NOT NULL,profit_base REAL NOT NULL,commission_rate REAL NOT NULL,commission_amount REAL NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',approved_at TEXT,paid_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(agent_id) REFERENCES agents(id));
 CREATE INDEX IF NOT EXISTS idx_commission_agent_status ON commissions(agent_id,status,created_at);
 `);
 const count=await db.prepare("SELECT COUNT(*) AS total FROM products").first();if(Number(count?.total||0)>0)return;
 const insert=db.prepare("INSERT OR IGNORE INTO products(id,name,brand,category,unit,price,prices_json,stock,images_json,status) VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE')");
 const statements=seedCatalog.products.map(p=>insert.bind(p.id,p.name,p.brand||"JIGz",p.category,p.unit,p.price,JSON.stringify(p.prices||{}),p.stock,JSON.stringify(p.images||[])));if(statements.length)await db.batch(statements)
}
async function products(db){await initializeDatabase(db);const r=await db.prepare("SELECT id,name,brand,category,unit,price,prices_json,stock,images_json FROM products WHERE status='ACTIVE' ORDER BY category COLLATE NOCASE,name COLLATE NOCASE").all();return r.results.map(x=>({...x,prices:JSON.parse(x.prices_json||"{}"),images:JSON.parse(x.images_json||"[]"),prices_json:undefined,images_json:undefined}))}
async function summary(db){await initializeDatabase(db);const [orders,pending,packing,shipping,low,agents,commission]=await db.batch([
 db.prepare("SELECT COUNT(*) total FROM orders"),db.prepare("SELECT COUNT(*) total FROM orders WHERE status='PENDING_PAYMENT'"),db.prepare("SELECT COUNT(*) total FROM orders WHERE status='PACKING'"),db.prepare("SELECT COUNT(*) total FROM orders WHERE status='READY_TO_SHIP'"),db.prepare("SELECT COUNT(*) total FROM products WHERE stock IS NOT NULL AND stock<=0"),db.prepare("SELECT COUNT(*) total FROM agents WHERE status='ACTIVE'"),db.prepare("SELECT COALESCE(SUM(commission_amount),0) total FROM commissions WHERE status='PENDING'")]);
 return{orders:orders.results[0]?.total||0,pending:pending.results[0]?.total||0,packing:packing.results[0]?.total||0,shipping:shipping.results[0]?.total||0,lowStock:low.results[0]?.total||0,activeAgents:agents.results[0]?.total||0,pendingCommission:commission.results[0]?.total||0}
}
async function parseBody(request){const type=request.headers.get("content-type")||"";if(!type.includes("application/json"))throw new Error("invalid_content_type");return request.json()}
async function adminApi(request,env,path){
 if(path==="/api/admin/login"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});if(!env.ADMIN_PIN||!env.SESSION_SECRET)return json({error:"admin_secrets_required"},{status:503});const body=await parseBody(request);if(!await sameSecret(String(body.pin||""),env.ADMIN_PIN))return json({error:"invalid_credentials"},{status:401});const token=await issueSession(env.SESSION_SECRET);return json({ok:true},{headers:{"set-cookie":`jigz_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`}})
 }
 if(!await validSession(request,env.SESSION_SECRET))return json({error:"unauthorized"},{status:401});
 if(path==="/api/admin/logout"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});
  return json({ok:true},{headers:{"set-cookie":"jigz_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"}})
 }
 if(path==="/api/admin/summary"&&request.method==="GET")return json({summary:await summary(env.DB)});
 if(path==="/api/admin/agents"&&request.method==="GET"){await initializeDatabase(env.DB);const r=await env.DB.prepare("SELECT id,code,name,agent_type,commission_rate,status,created_at FROM agents ORDER BY name").all();return json({agents:r.results})}
 if(path==="/api/admin/agents"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});const b=await parseBody(request),code=String(b.code||"").trim().toUpperCase(),name=String(b.name||"").trim(),type=String(b.agentType||"").toUpperCase(),rate=Number(b.commissionRate);if(!/^[A-Z0-9-]{3,24}$/.test(code)||!name||!["RESELLER","SALES"].includes(type)||!Number.isFinite(rate)||rate<0||rate>100)return json({error:"invalid_agent"},{status:400});await initializeDatabase(env.DB);await env.DB.prepare("INSERT INTO agents(code,name,agent_type,commission_rate,status) VALUES(?,?,?,?, 'ACTIVE') ON CONFLICT(code) DO UPDATE SET name=excluded.name,agent_type=excluded.agent_type,commission_rate=excluded.commission_rate,updated_at=CURRENT_TIMESTAMP").bind(code,name,type,rate).run();return json({ok:true})
 }
 if(path==="/api/admin/commissions"&&request.method==="GET"){await initializeDatabase(env.DB);const r=await env.DB.prepare("SELECT c.id,c.order_id,a.code agent_code,a.name agent_name,c.revenue_net,c.actual_cost,c.deductions,c.profit_base,c.commission_rate,c.commission_amount,c.status,c.created_at FROM commissions c JOIN agents a ON a.id=c.agent_id ORDER BY c.created_at DESC LIMIT 200").all();return json({commissions:r.results})}
 if(path==="/api/admin/commissions/recalculate"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});
  const b=await parseBody(request),orderId=String(b.orderId||"").trim();
  if(!orderId||orderId.length>80)return json({error:"invalid_order"},{status:400});
  await initializeDatabase(env.DB);
  const order=await env.DB.prepare("SELECT o.id,o.subtotal,o.discount,o.shipping_subsidy,o.payment_fee,o.refund_amount,o.status,a.id agent_id,a.commission_rate FROM orders o JOIN agents a ON a.code=o.agent_code AND a.status='ACTIVE' WHERE o.id=?").bind(orderId).first();
  if(!order)return json({error:"order_or_agent_not_found"},{status:404});
  const costRow=await env.DB.prepare("SELECT COALESCE(SUM(quantity*actual_cost),0) actual_cost FROM order_items WHERE order_id=?").bind(orderId).first();
  const revenueNet=Math.max(0,Number(order.subtotal)-Number(order.discount)-Number(order.refund_amount));
  const actualCost=Math.max(0,Number(costRow?.actual_cost||0));
  const deductions=Math.max(0,Number(order.shipping_subsidy)+Number(order.payment_fee));
  const profitBase=Math.max(0,revenueNet-actualCost-deductions);
  const reversed=["CANCELLED","REFUNDED"].includes(String(order.status).toUpperCase());
  const commissionAmount=reversed?0:profitBase*(Number(order.commission_rate)/100);
  const status=reversed?"REVERSED":"PENDING";
  await env.DB.prepare("INSERT INTO commissions(order_id,agent_id,revenue_net,actual_cost,deductions,profit_base,commission_rate,commission_amount,status) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET agent_id=excluded.agent_id,revenue_net=excluded.revenue_net,actual_cost=excluded.actual_cost,deductions=excluded.deductions,profit_base=excluded.profit_base,commission_rate=excluded.commission_rate,commission_amount=excluded.commission_amount,status=excluded.status,approved_at=NULL,paid_at=NULL").bind(orderId,order.agent_id,revenueNet,actualCost,deductions,profitBase,Number(order.commission_rate),commissionAmount,status).run();
  return json({ok:true,commission:{orderId,revenueNet,actualCost,deductions,profitBase,rate:Number(order.commission_rate),amount:commissionAmount,status}})
 }
 return json({error:"not_found"},{status:404})
}
export default{async fetch(request,env){const url=new URL(request.url);try{
 if(request.method==="GET"&&url.pathname==="/api/health"){await env.DB.prepare("SELECT 1").first();return json({ok:true,database:"connected"})}
 if(request.method==="GET"&&url.pathname==="/api/products")return json({products:await products(env.DB)},{headers:{"cache-control":"public, max-age=30, stale-while-revalidate=120"}});
 if(url.pathname.startsWith("/api/admin/"))return adminApi(request,env,url.pathname);
 if(url.pathname.startsWith("/api/"))return json({error:"not_found"},{status:404});
 if(url.pathname==="/admin"||url.pathname.startsWith("/admin/")){const target=new URL("/admin.html",url);return env.ASSETS.fetch(new Request(target,request))}
 return env.ASSETS.fetch(request)
 }catch(error){console.error(JSON.stringify({event:"request_failed",path:url.pathname,message:error instanceof Error?error.message:String(error)}));return json({error:"service_unavailable"},{status:503})}}};
