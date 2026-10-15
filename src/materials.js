export async function initializeMaterials(db){await db.batch(["CREATE TABLE IF NOT EXISTS supplies(id TEXT PRIMARY KEY,name TEXT NOT NULL,unit TEXT NOT NULL,stock REAL NOT NULL DEFAULT 0 CHECK(stock>=0),average_cents REAL NOT NULL DEFAULT 0,per_order REAL NOT NULL DEFAULT 0 CHECK(per_order>=0));", "CREATE TABLE IF NOT EXISTS supply_order_batches(order_id TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);", "CREATE TABLE IF NOT EXISTS supply_movements(id TEXT PRIMARY KEY,supply_id TEXT NOT NULL REFERENCES supplies(id),kind TEXT NOT NULL CHECK(kind IN ('PURCHASE','USE')),quantity REAL NOT NULL CHECK(quantity>0),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),order_id TEXT,note TEXT NOT NULL DEFAULT '',business_date TEXT NOT NULL,actor_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(order_id,supply_id));", "CREATE INDEX IF NOT EXISTS supply_movements_date ON supply_movements(business_date,kind);", "CREATE TABLE IF NOT EXISTS operating_expenses(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('BUSINESS','PERSONAL')),title TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),business_date TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);", "CREATE INDEX IF NOT EXISTS operating_expenses_date ON operating_expenses(business_date,kind);", "CREATE TRIGGER IF NOT EXISTS supplies_stock_guard BEFORE INSERT ON supply_movements WHEN NEW.kind='USE' AND NEW.quantity>(SELECT stock FROM supplies WHERE id=NEW.supply_id) BEGIN SELECT RAISE(ABORT,'materials_stock_low'); END;", "CREATE TRIGGER IF NOT EXISTS supplies_apply_purchase AFTER INSERT ON supply_movements WHEN NEW.kind='PURCHASE' BEGIN UPDATE supplies SET average_cents=(stock*average_cents+NEW.amount_cents)/(stock+NEW.quantity),stock=stock+NEW.quantity WHERE id=NEW.supply_id; END;", "CREATE TRIGGER IF NOT EXISTS supplies_apply_use AFTER INSERT ON supply_movements WHEN NEW.kind='USE' BEGIN UPDATE supplies SET stock=MAX(0,stock-NEW.quantity) WHERE id=NEW.supply_id; END;", "CREATE TRIGGER IF NOT EXISTS supplies_pack_order AFTER UPDATE OF status ON sales_orders\nWHEN NEW.status IN ('PACKED','SHIPPED','COMPLETED') AND OLD.status NOT IN ('PACKED','SHIPPED','COMPLETED') AND NEW.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM supply_order_batches WHERE order_id=NEW.id)\nBEGIN\nINSERT INTO supply_movements(id,supply_id,kind,quantity,amount_cents,order_id,note,business_date)\nSELECT 'order:'||NEW.id||':'||id,id,'USE',per_order,CAST(ROUND(per_order*average_cents) AS INTEGER),NEW.id,'ตัดวัสดุอัตโนมัติเมื่อแพ็กเสร็จ',date('now','+7 hours') FROM supplies WHERE per_order>0;\nINSERT INTO supply_order_batches(order_id) VALUES(NEW.id);\nEND;", "INSERT OR IGNORE INTO supplies(id,name,unit) VALUES('receipt-paper','กระดาษบิล','ม้วน'),('box','กล่อง','ใบ'),('pen','ปากกา','ด้าม'),('bag','ถุง','ใบ');"].map(sql=>db.prepare(sql)));}

const rounded=n=>Math.round(Number(n||0)*100)/100;
export async function materialTotals(db,period){
 const start=new Date(new Date(period.start).getTime()+25200000).toISOString().slice(0,10),end=new Date(new Date(period.end).getTime()+25200000).toISOString().slice(0,10);
 const [m,e]=await db.batch([
 db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='USE' THEN amount_cents ELSE 0 END),0) used,COALESCE(SUM(CASE WHEN kind='PURCHASE' THEN amount_cents ELSE 0 END),0) purchased FROM supply_movements WHERE business_date>=? AND business_date<?").bind(start,end),
 db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='BUSINESS' THEN amount_cents ELSE 0 END),0) business,COALESCE(SUM(CASE WHEN kind='PERSONAL' THEN amount_cents ELSE 0 END),0) personal FROM operating_expenses WHERE business_date>=? AND business_date<?").bind(start,end)]);
 return {materialsUsed:rounded(m.results[0].used/100),materialsPurchased:rounded(m.results[0].purchased/100),businessExpenses:rounded(e.results[0].business/100),personalExpenses:rounded(e.results[0].personal/100)};
}
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const text=(v,max=200)=>String(v??"").trim().slice(0,max);
const amount=v=>v!==""&&v!=null&&Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=1e8?Math.round(Number(v)*100):null;
const quantity=v=>v!==""&&v!=null&&Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=1e8&&Math.abs(Number(v)*1000-Math.round(Number(v)*1000))<.00001?Number(v):null;
export async function materialsApi(request,db,url,actor,{json,requireOrigin,parseBody,calculateClosing}){
 if(actor.role!=="OWNER")return json({error:"owner_required"},{status:403});
 if(request.method==="GET"){
  const month=url.searchParams.get("month")||new Date(Date.now()+25200000).toISOString().slice(0,7);
  const closing=await calculateClosing(db,"MONTH",month);
  if(!closing)return json({error:"invalid_month"},{status:400});
  const page=Math.max(1,Math.min(100000,Math.trunc(Number(url.searchParams.get("page"))||1)));
  const [supplies,movements,expenses,count]=await db.batch([
   db.prepare("SELECT * FROM supplies ORDER BY name"),
   db.prepare("SELECT m.*,s.name,s.unit FROM supply_movements m JOIN supplies s ON s.id=m.supply_id WHERE substr(business_date,1,7)=? ORDER BY business_date DESC,created_at DESC,id DESC LIMIT 50 OFFSET ?").bind(month,(page-1)*50),
   db.prepare("SELECT * FROM operating_expenses WHERE substr(business_date,1,7)=? ORDER BY business_date DESC,created_at DESC,id DESC LIMIT 50 OFFSET ?").bind(month,(page-1)*50),
   db.prepare("SELECT (SELECT COUNT(*) FROM supply_movements WHERE substr(business_date,1,7)=?) movements,(SELECT COUNT(*) FROM operating_expenses WHERE substr(business_date,1,7)=?) expenses").bind(month,month)]);
  return json({supplies:supplies.results,movements:movements.results,expenses:expenses.results,counts:count.results[0],page,closing});
 }
 if(request.method!=="POST")return json({error:"method_not_allowed"},{status:405});
 const blocked=requireOrigin(request);if(blocked)return blocked;
 const body=await parseBody(request),action=body.action,id=text(body.id,100);
 if(action==="rule"){
  const perOrder=body.perOrder===""||body.perOrder==null?NaN:Number(body.perOrder);
  if(!Number.isFinite(perOrder)||perOrder<0||perOrder>100000||Math.abs(perOrder*1000-Math.round(perOrder*1000))>.00001)return json({error:"invalid_quantity"},{status:400});
  const result=await db.prepare("UPDATE supplies SET per_order=? WHERE id=?").bind(perOrder,text(body.supplyId,100)).run();
  return result.meta.changes?json({ok:true}):json({error:"supply_not_found"},{status:404});
 }
 if(action==="supply"){
  const name=text(body.name,100),unit=text(body.unit,30);
  if(!name||!unit||!/^[a-zA-Z0-9_-]{8,100}$/.test(id))return json({error:"invalid_supply"},{status:400});
  await db.prepare("INSERT OR IGNORE INTO supplies(id,name,unit) VALUES(?,?,?)").bind(id,name,unit).run();
  return json({ok:true});
 }
 const businessDate=text(body.date,10),note=text(body.note,500);
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id)||!validDate(businessDate)||businessDate>new Date(Date.now()+25200000).toISOString().slice(0,10))return json({error:"invalid_date_or_id"},{status:400});
 // Keep closed financial snapshots consistent: post corrections in an open period.
 const closed=await db.prepare("SELECT id FROM financial_closings WHERE (period_type='DAY' AND period_key=?) OR (period_type='MONTH' AND period_key=?) LIMIT 1").bind(businessDate,businessDate.slice(0,7)).first();
 if(closed)return json({error:"expense_period_closed"},{status:409});
 if(action==="purchase"){
  const qty=quantity(body.quantity),cents=amount(body.total),supplyId=text(body.supplyId,100);
  if(qty===null||!cents)return json({error:"invalid_purchase"},{status:400});
  if(!await db.prepare("SELECT id FROM supplies WHERE id=?").bind(supplyId).first())return json({error:"supply_not_found"},{status:404});
  await db.prepare("INSERT OR IGNORE INTO supply_movements(id,supply_id,kind,quantity,amount_cents,note,business_date,actor_id) VALUES(?,?,'PURCHASE',?,?,?,?,?)").bind(id,supplyId,qty,cents,note,businessDate,actor.id).run();
  const row=await db.prepare("SELECT * FROM supply_movements WHERE id=?").bind(id).first();
  if(row.supply_id!==supplyId||row.quantity!==qty||row.amount_cents!==cents||row.business_date!==businessDate||row.note!==note)return json({error:"duplicate_request_changed"},{status:409});
  return json({ok:true});
 }
 if(action==="expense"){
  const cents=amount(body.total),kind=text(body.kind,20),title=text(body.title,160);
  if(!cents||!["BUSINESS","PERSONAL"].includes(kind)||!title)return json({error:"invalid_expense"},{status:400});
  await db.prepare("INSERT OR IGNORE INTO operating_expenses(id,kind,title,amount_cents,business_date,note,actor_id) VALUES(?,?,?,?,?,?,?)").bind(id,kind,title,cents,businessDate,note,actor.id).run();
  const row=await db.prepare("SELECT * FROM operating_expenses WHERE id=?").bind(id).first();
  if(row.kind!==kind||row.title!==title||row.amount_cents!==cents||row.business_date!==businessDate||row.note!==note)return json({error:"duplicate_request_changed"},{status:409});
  return json({ok:true});
 }
 return json({error:"invalid_action"},{status:400});
}
