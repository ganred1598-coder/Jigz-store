import fs from "node:fs";

const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const admin=fs.readFileSync(new URL("../public/admin.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");

const checks={
  checkoutHandler:/async function checkout\(event\)/.test(app),
  checkoutEndpoint:/path==="\/api\/orders"&&request\.method==="POST"/.test(worker),
  stockValidation:/insufficient_stock/.test(worker),
  safeSubmitButton:/event\.submitter\|\|event\.currentTarget/.test(app),
  clickableTracking:/function trackingLink\(order/.test(app)&&/target="_blank"/.test(app),
  printableReceipt:/data-print-receipt/.test(app)&&/window\.print\(\)/.test(app),
  orderTimeline:/function timelineHtml\(order\)/.test(app),
  trackingShare:/navigator\.share/.test(app)&&/data-copy-tracking/.test(app),
  codCloseGuard:/cod_payment_required/.test(worker)&&/cod-received/.test(worker),
  adminAppointment:/\/api\/admin\/staff/.test(worker),
  ownerProductDelete:/request\.method==="DELETE"/.test(worker)&&/owner_required/.test(worker),
  categoryDropdown:/function categoryOptions/.test(admin)&&/newCategory/.test(admin),
  directProductUpload:/function productImageData/.test(admin)&&/function productImageUploader/.test(admin)&&/type="file"/.test(admin),
  fifoOpeningCost:/unitCost/.test(admin)&&/inventory_lots/.test(worker),
  editableAgents:/function editAgent/.test(admin)&&/UPDATE_AGENT/.test(worker),
  editableCommissions:/function editCommission/.test(admin)&&/UPDATE_COMMISSION/.test(worker),
  promotionImage:/promoImage/.test(admin)&&/normalizedImages\(body\.image/.test(worker)
};

if(Object.values(checks).some(value=>!value))throw new Error(`feature_check_failed:${JSON.stringify(checks)}`);
console.log(JSON.stringify({ok:true,checks}));
