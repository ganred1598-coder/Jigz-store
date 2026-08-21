import fs from "node:fs";

const app=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const admin=fs.readFileSync(new URL("../public/admin.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/admin.html",import.meta.url),"utf8");
const wrangler=fs.readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8");

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
  promotionImage:/promoImage/.test(admin)&&/normalizedImages\(body\.image/.test(worker),
  selectProductWorks:/"scrollProducts" in target\.dataset/.test(app),
  themedNavIcons:/<svg viewBox="0 0 24 24"/.test(fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8")),
  cartStarAnimation:/function flyStarToCart/.test(app)&&/Math\.random/.test(app)&&/cart-star/.test(app),
  customOrderSound:/function playAlertSound/.test(admin)&&/setSoundFile/.test(admin)&&/notification_sound/.test(worker),
  promotionManagement:/UPDATE_PROMOTION/.test(worker)&&/DELETE_PROMOTION/.test(worker)&&/function editPromotion/.test(admin),
  reportFilters:/reportFilterForm/.test(admin)&&/url\.searchParams\.get\("from"\)/.test(worker),
  checkoutLayout:/checkout-form/.test(app)&&/checkout-section/.test(app)&&/ยอดชำระทั้งหมด/.test(app),
  qrDownload:/function downloadQrImage/.test(app)&&/data-download-qr/.test(app),
  bankCopy:/function copyBankNumber/.test(app)&&/data-copy-bank/.test(app),
  walletSchema:/CREATE TABLE IF NOT EXISTS wallet_accounts/.test(worker)&&/CREATE TABLE IF NOT EXISTS wallet_transactions/.test(worker)&&/prevent_negative_wallet_balance/.test(worker),
  walletCustomerApi:/path==="\/api\/wallet"/.test(worker)&&/\/api\/wallet\/deposits/.test(worker)&&/\/api\/wallet\/withdrawals/.test(worker),
  walletCustomerUi:/function showWallet\(/.test(app)&&/function showWalletDeposit/.test(app)&&/function showWalletWithdrawal/.test(app),
  easySlipV2:/https:\/\/api\.easyslip\.com\/v2\/verify\/bank/.test(worker)&&/EASYSLIP_API_KEY/.test(worker),
  slipSafety:/matchAccount:true/.test(worker)&&/matchAmount:expectedAmount/.test(worker)&&/checkDuplicate:true/.test(worker),
  walletAdmin:/id="wallet" class="page"/.test(html)&&/function loadWalletRequests/.test(admin)&&/function reviewWallet/.test(admin),
  agentWalletLink:/id="agentUserId"/.test(html)&&/userId:\$\("#agentUserId"\)\.value/.test(admin)&&/idx_agents_user/.test(worker),
  commissionWalletRelease:/function releaseWeeklyCommissions/.test(worker)&&/\/api\/admin\/commissions\/release/.test(worker)&&/reference_type='COMMISSION'/.test(worker),
  weeklyCron:/"0 10 \* \* SUN"/.test(wrangler)&&/async scheduled\(/.test(worker),
  financeIdempotency:/idx_wallet_reference/.test(worker)&&/idx_slip_trans_ref/.test(worker),
  walletVersion:/version:"5\.0\.0"/.test(worker)&&/v5\.0\.0/.test(html)
};

if(Object.values(checks).some(value=>!value))throw new Error(`feature_check_failed:${JSON.stringify(checks)}`);
console.log(JSON.stringify({ok:true,checks}));
