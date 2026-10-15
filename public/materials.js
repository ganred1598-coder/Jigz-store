(() => {
 let page=1,requestVersion=0;
 const root=document.getElementById('materials');
 const today=()=>new Date(Date.now()+25200000).toISOString().slice(0,10);
 const messages={expense_period_closed:'รอบนี้ปิดยอดแล้ว กรุณาบันทึกในรอบที่ยังเปิด',duplicate_request_changed:'คำขอเดิมถูกบันทึกแล้ว กรุณารีเฟรชก่อนทำรายการใหม่',owner_required:'เฉพาะเจ้าของเท่านั้น',invalid_date_or_id:'กรุณาระบุวันที่ที่ถูกต้องและไม่เกินวันนี้',invalid_quantity:'จำนวนต้องไม่ติดลบ และมีทศนิยมไม่เกิน 3 ตำแหน่ง',invalid_purchase:'ตรวจสอบจำนวนและยอดซื้ออีกครั้ง',invalid_expense:'ตรวจสอบชื่อ ประเภท และยอดค่าใช้จ่าย',supply_not_found:'ไม่พบวัสดุที่เลือก'};
 const status=message=>{root.querySelector('[data-material-status]').textContent=message;};
 const field=(label,name,type='text',extra='')=>`<label>${label}<input class="field" name="${name}" type="${type}" required ${extra}></label>`;
 const dateField=()=>field('วันที่','date','date',`value="${today()}" max="${today()}"`);
 const totalField=()=>field('ยอดรวม (บาท)','total','number','min="0.01" max="100000000" step="0.01"');
 const noteField=()=>'<label>หมายเหตุ / ร้านที่ซื้อ / เลขบิล<input class="field" name="note" maxlength="500"></label>';
 const save='<button class="button" type="submit">บันทึก</button>';
 function init(){
  if(root.dataset.ready)return;
  root.dataset.ready='1';
  root.innerHTML=`<div class="page-head"><div><h1>วัสดุและค่าใช้จ่าย</h1><p>ซื้อเข้า · ตัดตามออเดอร์ · สรุปกำไรรายเดือน</p></div><label>เลือกเดือน<input class="field" id="materialsMonth" type="month" value="${today().slice(0,7)}"></label></div><p data-material-status role="status" aria-live="polite"></p><div id="materialsSummary" class="materials-grid"></div><p class="notice">กำไรสุทธิร้าน = รายรับ − ต้นทุนสินค้า/ขนส่ง/ค่าแพ็กเดิม − ค่าคอม − วัสดุที่ใช้ − ค่าใช้จ่ายร้าน<br>ยอดหลังหักส่วนตัว = กำไรสุทธิร้าน − ค่าใช้จ่ายส่วนตัว<br>ยอดซื้อวัสดุแสดงแยก ไม่หักซ้ำจากกำไร กรุณาไม่บันทึกค่าวัสดุซ้ำในค่าแพ็กหรือค่าใช้จ่ายร้าน</p><div class="materials-grid"><article class="panel"><h2>ซื้อวัสดุเข้า</h2><form class="form" data-material-form="purchase"><label>วัสดุ<select class="field" name="supplyId" required></select></label>${field('จำนวนที่ซื้อ','quantity','number','min="0.001" max="100000000" step="0.001"')}${totalField()}${dateField()}${noteField()}${save}</form></article><article class="panel"><h2>บันทึกค่าใช้จ่าย</h2><form class="form" data-material-form="expense"><label>ประเภท<select class="field" name="kind"><option value="BUSINESS">ค่าใช้จ่ายร้าน</option><option value="PERSONAL">ค่าใช้จ่ายส่วนตัว</option></select></label>${field('รายการค่าใช้จ่าย','title','text','maxlength="160"')}${totalField()}${dateField()}${noteField()}${save}</form></article></div><article class="panel"><h2>สต็อกและจำนวนที่ใช้ต่อออเดอร์</h2><p class="muted">ตัดครั้งเดียวเมื่อแพ็กเสร็จ หรือข้ามไปจัดส่ง/สำเร็จ ตั้ง 0 เพื่อไม่ตัดอัตโนมัติ วัสดุไม่พอจะหยุดการเปลี่ยนสถานะ ยกเลิกออเดอร์แล้วไม่คืนวัสดุที่ใช้ไป</p><div id="materialsStock" class="materials-grid"></div><details><summary>เพิ่มวัสดุชนิดใหม่</summary><form class="form" data-material-form="supply">${field('ชื่อวัสดุ','name','text','maxlength="100"')}${field('หน่วย เช่น ใบ / ม้วน / ด้าม','unit','text','maxlength="30"')}${save}</form></details></article><div class="materials-grid"><article class="panel"><h2>ประวัติวัสดุในเดือน</h2><div id="materialsMovements"></div></article><article class="panel"><h2>ค่าใช้จ่ายในเดือน</h2><div id="materialsExpenses"></div></article></div><div class="row-actions"><button type="button" class="button ghost" id="materialsPrev">ก่อนหน้า</button><span id="materialsPage"></span><button type="button" class="button ghost" id="materialsNext">ถัดไป</button></div>`;
  root.querySelector('#materialsMonth').addEventListener('change',()=>{page=1;load();});
  root.querySelector('#materialsPrev').onclick=()=>{page=Math.max(1,page-1);load();};
  root.querySelector('#materialsNext').onclick=()=>{page++;load();};
  root.addEventListener('submit',async event=>{
   const form=event.target.closest('[data-material-form]');if(!form)return;event.preventDefault();
   const button=form.querySelector('button[type="submit"]');if(button.disabled)return;
   const body={...Object.fromEntries(new FormData(form)),action:form.dataset.materialForm,id:form.dataset.requestId||(form.dataset.requestId=crypto.randomUUID())};
   button.disabled=true;status('กำลังบันทึก…');
   try{await api('/api/admin/materials',{method:'POST',body:JSON.stringify(body)});delete form.dataset.requestId;if(body.action!=='rule')form.reset();await load();status('บันทึกแล้ว');}
   catch(error){status(messages[error.message]||errorText(error));}
   finally{button.disabled=false;}
  });
 }
 async function load(){
  init();const version=++requestVersion;status('กำลังโหลด…');
  try{
   const data=await api(`/api/admin/materials?month=${encodeURIComponent(root.querySelector('#materialsMonth').value)}&page=${page}`);if(version!==requestVersion)return;
   const c=data.closing,metrics=[['รายรับ',c.revenueTotal],['วัสดุที่ใช้',c.materialsUsed],['ค่าใช้จ่ายร้าน',c.businessExpenses],['กำไรสุทธิร้าน',c.netProfit],['ค่าใช้จ่ายส่วนตัว',c.personalExpenses],['ยอดหลังหักส่วนตัว',c.afterPersonal],['ยอดซื้อวัสดุ (แยกจากกำไร)',c.materialsPurchased]];
   root.querySelector('#materialsSummary').innerHTML=metrics.map(([label,value])=>`<article class="panel"><small>${label}</small><strong class="materials-amount">${money.format(value)}</strong></article>`).join('');
   const select=root.querySelector('[name="supplyId"]'),selected=select.value;
   select.innerHTML=data.supplies.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.unit)})</option>`).join('');if(selected)select.value=selected;
   root.querySelector('#materialsStock').innerHTML=data.supplies.map(s=>`<div class="materials-record"><h3>${esc(s.name)}</h3><p>คงเหลือ <b>${Number(s.stock).toLocaleString('th-TH',{maximumFractionDigits:3})}</b> ${esc(s.unit)} · ทุนเฉลี่ย ${money.format(s.average_cents/100)}</p><form class="form" data-material-form="rule"><input type="hidden" name="supplyId" value="${esc(s.id)}">${field('ใช้ต่อออเดอร์ ('+esc(s.unit)+')','perOrder','number',`min="0" max="100000" step="0.001" value="${Number(s.per_order)}"`)}${save}</form></div>`).join('');
   root.querySelector('#materialsMovements').innerHTML=data.movements.map(m=>`<div class="materials-record"><b>${m.kind==='PURCHASE'?'ซื้อเข้า':'ใช้'} · ${esc(m.name)}</b><p>${Number(m.quantity)} ${esc(m.unit)} · ${money.format(m.amount_cents/100)}</p><small>${esc(m.business_date)} ${esc(m.order_id||'')}</small><p>${esc(m.note)}</p></div>`).join('')||'<p>ไม่มีรายการในเดือนนี้</p>';
   root.querySelector('#materialsExpenses').innerHTML=data.expenses.map(e=>`<div class="materials-record"><b>${esc(e.title)} · ${money.format(e.amount_cents/100)}</b><p>${e.kind==='PERSONAL'?'ส่วนตัว':'ร้าน'} · ${esc(e.business_date)}</p><small>${esc(e.note)}</small></div>`).join('')||'<p>ไม่มีค่าใช้จ่ายในเดือนนี้</p>';
   const pages=Math.max(1,Math.ceil(Math.max(data.counts.movements,data.counts.expenses)/50));root.querySelector('#materialsPage').textContent=`หน้า ${page} / ${pages}`;root.querySelector('#materialsPrev').disabled=page<=1;root.querySelector('#materialsNext').disabled=page>=pages;status('ข้อมูลล่าสุด · รายการละไม่เกิน 50 ต่อหน้า');
  }catch(error){if(version===requestVersion)status(messages[error.message]||errorText(error));}
 }
 window.loadMaterials=load;
})();
