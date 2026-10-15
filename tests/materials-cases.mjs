// Uses the same SQLite-backed Worker harness as runtime.mjs.
export async function testMaterials({assert,db,json,request,setCookie,ownerCookie,salesCookie}) {
 setCookie(salesCookie);
 assert.equal((await request('/api/admin/materials')).status,403);
 setCookie(ownerCookie);
 const post=body=>json('/api/admin/materials',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const date=new Date(Date.now()+25200000).toISOString().slice(0,10),month=date.slice(0,7);
 const initial=(await json('/api/admin/materials?month='+month)).body.closing;
 const purchase={action:'purchase',id:'material-buy-0001',supplyId:'box',quantity:10,total:100,date,note:'test invoice'};
 assert.equal((await post(purchase)).response.status,200);
 assert.equal((await post(purchase)).response.status,200);
 assert.equal((await db.prepare("SELECT stock FROM supplies WHERE id='box'").first()).stock,10);
 assert.equal((await post({...purchase,total:200})).response.status,409);
 assert.equal((await post({...purchase,id:'material-buy-0002',total:200})).response.status,200);
 const box=await db.prepare("SELECT * FROM supplies WHERE id='box'").first();
 assert.equal(box.stock,20);assert.equal(box.average_cents,1500);
 assert.equal((await post({action:'rule',supplyId:'box',perOrder:2})).response.status,200);
 assert.equal((await post({action:'rule',supplyId:'bag',perOrder:1})).response.status,200);
 assert.equal((await post({action:'rule',supplyId:'pen',perOrder:-1})).response.status,400);
 await db.prepare("INSERT INTO sales_orders(id,source,customer_name,payment_method,status,subtotal,total) VALUES('materials-order','ONLINE','Test','TRANSFER','PACKING',0,0)").run();
 await assert.rejects(()=>db.prepare("UPDATE sales_orders SET status='PACKED' WHERE id='materials-order'").run(),/materials_stock_low/);
 assert.equal((await db.prepare("SELECT status FROM sales_orders WHERE id='materials-order'").first()).status,'PACKING');
 assert.equal((await db.prepare("SELECT stock FROM supplies WHERE id='box'").first()).stock,20);
 assert.equal((await post({action:'rule',supplyId:'bag',perOrder:0})).response.status,200);
 await db.prepare("UPDATE sales_orders SET status='PACKED' WHERE id='materials-order'").run();
 assert.equal((await db.prepare("SELECT stock FROM supplies WHERE id='box'").first()).stock,18);
 await db.prepare("UPDATE sales_orders SET status='PACKING' WHERE id='materials-order'").run();
 await db.prepare("UPDATE sales_orders SET status='PACKED' WHERE id='materials-order'").run();
 await db.prepare("UPDATE sales_orders SET status='CANCELLED' WHERE id='materials-order'").run();
 assert.equal((await db.prepare("SELECT stock FROM supplies WHERE id='box'").first()).stock,18);
 for(const [kind,total] of [['BUSINESS',50],['PERSONAL',70]]){
  const body={action:'expense',id:'expense-test-'+kind,title:kind,total,date,kind};
  assert.equal((await post(body)).response.status,200);assert.equal((await post(body)).response.status,200);
 }
 assert.equal((await post({...purchase,id:'future-purchase',date:'2099-01-01'})).response.status,400);
 assert.equal((await post({...purchase,id:'invalid-purchase',date:'2025-02-30'})).response.status,400);
 const c=(await json('/api/admin/materials?month='+month)).body.closing;
 assert.equal(c.materialsUsed-initial.materialsUsed,30);assert.equal(c.materialsPurchased-initial.materialsPurchased,300);
 assert.equal(c.businessExpenses-initial.businessExpenses,50);assert.equal(c.personalExpenses-initial.personalExpenses,70);
 assert.ok(Math.abs(c.netProfit-(initial.netProfit-80))<.001,'Purchases must not be deducted twice');
 assert.ok(Math.abs(c.afterPersonal-(initial.afterPersonal-150))<.001);
 const prior=(await json('/api/admin/materials?month=2020-01')).body.closing;
 assert.equal(prior.materialsUsed,0);assert.equal(prior.businessExpenses,0);
 const closed=await json('/api/admin/closings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({periodType:'MONTH',periodKey:month})});
 assert.equal(closed.response.status,201,JSON.stringify(closed.body));
 assert.equal(closed.body.closing.afterPersonal,c.afterPersonal);assert.equal(closed.body.closing.materialsUsed,c.materialsUsed);
 assert.equal((await post({...purchase,id:'closed-purchase'})).response.status,409);
 const backup=(await json('/api/admin/backup')).body;
 assert.equal(backup.supplies.length,4);assert.ok(backup.supplyMovements.length);assert.equal(backup.operatingExpenses.length,2);
 console.log('PASS: materials weighted cost, retry safety, atomic stock guard, once-only deduction, cancellation, owner permissions, monthly expenses, personal balance, closed snapshot and backup');
}
