import seedCatalog from "../public/products.json";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const enc=new TextEncoder();
function json(data,init={}){return new Response(JSON.stringify(data),{...init,headers:{...JSON_HEADERS,...(init.headers||{})}})}
function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
function fromB64(value){const normalized=value.replaceAll("-","+").replaceAll("_","/");const raw=atob(normalized+"=".repeat((4-normalized.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function b64json(value){return b64(enc.encode(JSON.stringify(value)))}
async function digest(value){return new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value)))}
function sameOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin}
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return b64(bytes)}
function sessionCookie(token){return `jigz_sid=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000`}
function readCookie(request){const m=(request.headers.get("cookie")||"").match(/(?:^|;\s*)jigz_sid=([^;]+)/);return m?decodeURIComponent(m[1]):""}
async function tokenHash(token){return b64(await digest(token))}

async function initializeDatabase(db){
 await db.exec(`
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,brand TEXT NOT NULL DEFAULT 'JIGz',category TEXT NOT NULL,unit TEXT NOT NULL,price REAL,prices_json TEXT NOT NULL DEFAULT '{}',stock REAL,images_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_products_status_category ON products(status,category,name);
 CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id TEXT NOT NULL,movement_type TEXT NOT NULL,quantity REAL NOT NULL,note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE TABLE IF NOT EXISTS inventory_lots(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id TEXT NOT NULL,received_qty REAL NOT NULL,remaining_qty REAL NOT NULL,unit_cost REAL NOT NULL,supplier TEXT,note TEXT,received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE INDEX IF NOT EXISTS idx_lots_fifo ON inventory_lots(product_id,received_at,id);
 CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,agent_type TEXT NOT NULL CHECK(agent_type IN ('RESELLER','SALES')),commission_rate REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('CUSTOMER','ADMIN','OWNER')),status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_users_role_seen ON users(role,last_seen_at);
 CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id,expires_at);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_name TEXT,agent_code TEXT,subtotal REAL NOT NULL DEFAULT 0,discount REAL NOT NULL DEFAULT 0,shipping_subsidy REAL NOT NULL DEFAULT 0,payment_fee REAL NOT NULL DEFAULT 0,refund_amount REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'DRAFT',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,paid_at TEXT,completed_at TEXT,FOREIGN KEY(agent_code) REFERENCES agents(code));
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity REAL NOT NULL,unit_price REAL NOT NULL,actual_cost REAL NOT NULL DEFAULT 0,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(product_id) REFERENCES products(id));
 CREATE TABLE IF NOT EXISTS commissions(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL UNIQUE,agent_id INTEGER NOT NULL,revenue_net REAL NOT NULL,actual_cost REAL NOT NULL,deductions REAL NOT NULL,profit_base REAL NOT NULL,commission_rate REAL NOT NULL,commission_amount REAL NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',approved_at TEXT,paid_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(agent_id) REFERENCES agents(id));
 CREATE INDEX IF NOT EXISTS idx_commission_agent_status ON commissions(agent_id,status,created_at);
 CREATE TABLE IF NOT EXISTS system_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS push_subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,subscription_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE INDEX IF NOT EXISTS idx_push_user_status ON push_subscriptions(user_id,status,updated_at);
 `);
 const count=await db.prepare("SELECT COUNT(*) AS total FROM products").first();if(Number(count?.total||0)>0)return;
 const insert=db.prepare("INSERT OR IGNORE INTO products(id,name,brand,category,unit,price,prices_json,stock,images_json,status) VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE')");
 const statements=seedCatalog.products.map(p=>insert.bind(p.id,p.name,p.brand||"JIGz",p.category,p.unit,p.price,JSON.stringify(p.prices||{}),p.stock,JSON.stringify(p.images||[])));if(statements.length)await db.batch(statements)
}
async function currentUser(request,db){const token=readCookie(request);if(!token)return null;const user=await db.prepare("SELECT u.id,u.display_name,u.role,u.status FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.status='ACTIVE'").bind(await tokenHash(token)).first();return user||null}
async function newUser(db,role){const id=crypto.randomUUID(),token=randomToken(),hash=await tokenHash(token),expires=new Date(Date.now()+31536000000).toISOString(),displayName=`JIGZ-${id.slice(0,8).toUpperCase()}`;await db.batch([db.prepare("INSERT INTO users(id,display_name,role) VALUES(?,?,?)").bind(id,displayName,role),db.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(hash,id,expires)]);return{user:{id,display_name:displayName,role,status:"ACTIVE"},cookie:sessionCookie(token)}}
async function ensureUser(request,db,wantsAdmin=false){await initializeDatabase(db);let user=await currentUser(request,db),cookie="";if(!user){const count=await db.prepare("SELECT COUNT(*) total FROM users WHERE role IN ('OWNER','ADMIN') AND status='ACTIVE'").first(),role=wantsAdmin&&Number(count?.total||0)===0?"OWNER":"CUSTOMER",created=await newUser(db,role);user=created.user;cookie=created.cookie}if(wantsAdmin&&user.role==="CUSTOMER"){const count=await db.prepare("SELECT COUNT(*) total FROM users WHERE role IN ('OWNER','ADMIN') AND status='ACTIVE'").first();if(Number(count?.total||0)===0){await db.prepare("UPDATE users SET role='OWNER',last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();user.role="OWNER"}else return{denied:true,user,cookie}}await db.prepare("UPDATE users SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();return{user,cookie}}
async function products(db){await initializeDatabase(db);const r=await db.prepare("SELECT id,name,brand,category,unit,price,prices_json,stock,images_json FROM products WHERE status='ACTIVE' ORDER BY category COLLATE NOCASE,name COLLATE NOCASE").all();return r.results.map(x=>({...x,prices:JSON.parse(x.prices_json||"{}"),images:JSON.parse(x.images_json||"[]"),prices_json:undefined,images_json:undefined}))}
async function summary(db){await initializeDatabase(db);const [orders,pending,packing,shipping,low,agents,commission,online]=await db.batch([
 db.prepare("SELECT COUNT(*) total FROM orders"),db.prepare("SELECT COUNT(*) total FROM orders WHERE status='PENDING_PAYMENT'"),db.prepare("SELECT COUNT(*) total FROM orders WHERE status='PACKING'"),db.prepare("SELECT COUNT(*) total FROM orders WHERE status='READY_TO_SHIP'"),db.prepare("SELECT COUNT(*) total FROM products WHERE stock IS NOT NULL AND stock<=0"),db.prepare("SELECT COUNT(*) total FROM agents WHERE status='ACTIVE'"),db.prepare("SELECT COALESCE(SUM(commission_amount),0) total FROM commissions WHERE status='PENDING'"),db.prepare("SELECT COUNT(*) total FROM users WHERE last_seen_at>=datetime('now','-5 minutes')")]);
 return{orders:orders.results[0]?.total||0,pending:pending.results[0]?.total||0,packing:packing.results[0]?.total||0,shipping:shipping.results[0]?.total||0,lowStock:low.results[0]?.total||0,activeAgents:agents.results[0]?.total||0,pendingCommission:commission.results[0]?.total||0,onlineUsers:online.results[0]?.total||0}
}
async function parseBody(request){const type=request.headers.get("content-type")||"";if(!type.includes("application/json"))throw new Error("invalid_content_type");return request.json()}
async function ensureVapidKeys(db){
 const existing=await db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='vapid_keys'").first();if(existing?.setting_value)return JSON.parse(existing.setting_value);
 const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]),privateJwk=await crypto.subtle.exportKey("jwk",pair.privateKey),publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey),x=fromB64(publicJwk.x),y=fromB64(publicJwk.y),point=new Uint8Array(65);point[0]=4;point.set(x,1);point.set(y,33);
 const generated={privateJwk,publicKey:b64(point)};await db.prepare("INSERT OR IGNORE INTO system_settings(setting_key,setting_value) VALUES('vapid_keys',?)").bind(JSON.stringify(generated)).run();const saved=await db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='vapid_keys'").first();return JSON.parse(saved.setting_value)
}
async function vapidAuthorization(endpoint,keys){
 const audience=new URL(endpoint).origin,header=b64json({typ:"JWT",alg:"ES256"}),payload=b64json({aud:audience,exp:Math.floor(Date.now()/1000)+43200,sub:"https://jigz-store.namphujigz.workers.dev"}),unsigned=`${header}.${payload}`;
 const privateKey=await crypto.subtle.importKey("jwk",keys.privateJwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]),signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},privateKey,enc.encode(unsigned)));return`vapid t=${unsigned}.${b64(signature)}, k=${keys.publicKey}`
}
async function sendPush(endpoint,keys){
 const response=await fetch(endpoint,{method:"POST",headers:{Authorization:await vapidAuthorization(endpoint,keys),TTL:"60","Content-Length":"0"}});return{ok:response.ok,status:response.status,expired:response.status===404||response.status===410}
}
async function adminApi(request,env,path){
 await initializeDatabase(env.DB);
 if(path==="/api/admin/session"&&request.method==="GET"){
  const session=await ensureUser(request,env.DB,true);if(session.denied)return json({error:"device_not_authorized",user:session.user},{status:403,headers:session.cookie?{"set-cookie":session.cookie}:{}});return json({ok:true,user:session.user},{headers:session.cookie?{"set-cookie":session.cookie}:{}})
 }
 const actor=await currentUser(request,env.DB);if(!actor||!["OWNER","ADMIN"].includes(actor.role))return json({error:"unauthorized"},{status:401});
 if(path==="/api/admin/summary"&&request.method==="GET")return json({summary:await summary(env.DB)});
 if(path==="/api/admin/agents"&&request.method==="GET"){await initializeDatabase(env.DB);const r=await env.DB.prepare("SELECT id,code,name,agent_type,commission_rate,status,created_at FROM agents ORDER BY name").all();return json({agents:r.results})}
 if(path==="/api/admin/users"&&request.method==="GET"){const r=await env.DB.prepare("SELECT id,display_name,role,status,created_at,last_seen_at FROM users ORDER BY last_seen_at DESC LIMIT 200").all();return json({users:r.results})}
 if(path==="/api/admin/push/config"&&request.method==="GET"){const keys=await ensureVapidKeys(env.DB);const row=await env.DB.prepare("SELECT COUNT(*) total FROM push_subscriptions WHERE user_id=? AND status='ACTIVE'").bind(actor.id).first();return json({supported:true,publicKey:keys.publicKey,subscriptions:Number(row?.total||0)})}
 if(path==="/api/admin/push/subscribe"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});const b=await parseBody(request),subscription=b?.subscription,endpoint=String(subscription?.endpoint||"");if(!endpoint.startsWith("https://")||endpoint.length>2048||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return json({error:"invalid_subscription"},{status:400});await env.DB.prepare("INSERT INTO push_subscriptions(user_id,endpoint,subscription_json,status) VALUES(?,?,?,'ACTIVE') ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription_json=excluded.subscription_json,status='ACTIVE',updated_at=CURRENT_TIMESTAMP").bind(actor.id,endpoint,JSON.stringify(subscription)).run();return json({ok:true})
 }
 if(path==="/api/admin/push/unsubscribe"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});const b=await parseBody(request),endpoint=String(b?.endpoint||"");if(!endpoint||endpoint.length>2048)return json({error:"invalid_endpoint"},{status:400});await env.DB.prepare("UPDATE push_subscriptions SET status='INACTIVE',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND endpoint=?").bind(actor.id,endpoint).run();return json({ok:true})
 }
 if(path==="/api/admin/push/test"&&request.method==="POST"){
  if(!sameOrigin(request))return json({error:"invalid_origin"},{status:403});const rows=await env.DB.prepare("SELECT id,endpoint FROM push_subscriptions WHERE user_id=? AND status='ACTIVE' ORDER BY updated_at DESC LIMIT 10").bind(actor.id).all();if(!rows.results.length)return json({error:"no_subscription"},{status:404});const keys=await ensureVapidKeys(env.DB),results=await Promise.all(rows.results.map(async row=>({id:row.id,...await sendPush(row.endpoint,keys)})));const expired=results.filter(x=>x.expired);if(expired.length)await env.DB.batch(expired.map(x=>env.DB.prepare("UPDATE push_subscriptions SET status='EXPIRED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.id)));return json({ok:results.some(x=>x.ok),sent:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length},{status:results.some(x=>x.ok)?200:502})
 }
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
 if(request.method==="GET"&&url.pathname==="/api/session"){const session=await ensureUser(request,env.DB,false);return json({user:session.user},{headers:session.cookie?{"set-cookie":session.cookie}:{}})}
 if(request.method==="GET"&&url.pathname==="/api/products")return json({products:await products(env.DB)},{headers:{"cache-control":"public, max-age=30, stale-while-revalidate=120"}});
 if(url.pathname.startsWith("/api/admin/"))return adminApi(request,env,url.pathname);
 if(url.pathname.startsWith("/api/"))return json({error:"not_found"},{status:404});
 if(url.pathname==="/admin"||url.pathname.startsWith("/admin/")){const target=new URL("/admin.html",url);return env.ASSETS.fetch(new Request(target,request))}
 return env.ASSETS.fetch(request)
 }catch(error){console.error(JSON.stringify({event:"request_failed",path:url.pathname,message:error instanceof Error?error.message:String(error)}));return json({error:"service_unavailable"},{status:503})}}};
