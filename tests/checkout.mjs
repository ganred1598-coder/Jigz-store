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
  closingSchema:/CREATE TABLE IF NOT EXISTS financial_closings/.test(worker)&&/UNIQUE\(period_type,period_key\)/.test(worker),
  closingApi:/\/api\/admin\/closings/.test(worker)&&/function calculateClosing/.test(worker)&&/function createClosing/.test(worker),
  closingUi:/id="closings" class="page"/.test(html)&&/function loadClosings/.test(admin)&&/function createFinancialClosing/.test(admin)&&/function showClosingDetail/.test(admin),
  thaiClosingBoundary:/7\*3600000/.test(worker)&&/period_type/.test(worker),
  safeUserDelete:/userDeleteMatch/.test(worker)&&/ARCHIVE_USER/.test(worker)&&/user_balance_not_zero/.test(worker)&&/user_wallet_pending/.test(worker),
  userDeleteUi:/data-user-delete/.test(admin)&&/function deleteUser/.test(admin),
  primaryOwnerSchema:/is_primary_owner/.test(worker)&&/idx_single_primary_owner/.test(worker),
  secondaryOwnerLimit:/secondary_owner_limit/.test(worker)&&/limit_secondary_owners_update/.test(worker)&&/secondaryOwnerLimit:4/.test(worker),
  ownerApprovalFlow:/owner_deletion_requests/.test(worker)&&/REQUEST_OWNER_DELETION/.test(worker)&&/APPROVE_OWNER_DELETION/.test(worker)&&/primary_owner_required/.test(worker),
  ownerUi:/secondaryOwnerCount/.test(html)&&/function renderOwnerRequests/.test(admin)&&/function reviewOwnerDeletion/.test(admin),
  calmMotion:/calm-star-drift/.test(fs.readFileSync(new URL("../public/enhancements.css",import.meta.url),"utf8"))&&/prefers-reduced-motion/.test(fs.readFileSync(new URL("../public/enhancements.css",import.meta.url),"utf8")),
  responsiveSafeArea:/safe-area-inset/.test(fs.readFileSync(new URL("../public/enhancements.css",import.meta.url),"utf8"))&&/100dvh/.test(fs.readFileSync(new URL("../public/enhancements.css",import.meta.url),"utf8")),
  labeledProductForm:/class="field-label"/.test(admin)&&/ราคาขายต่อ 1 หน่วย/.test(admin)&&/สต็อกเริ่มต้น/.test(admin),
  standardPriceTiers:/ใช้เรท 1G–1000G/.test(admin)&&/10,30,50,100,500,1000/.test(admin)&&/function readPriceTiers/.test(admin),
  customerRateMenu:/function sizeLabel/.test(app)&&/product-rate-list/.test(app)&&/เลือกขนาด \/ เรทราคา/.test(app),
  stockAwareTierMenu:/function reservedQuantity/.test(app)&&/สต็อกไม่พอ/.test(app)&&/data-cart-qty/.test(app)&&/function stockProblem/.test(app),
  aggregateStockGuard:/requestedByProduct/.test(worker)&&/fifoReservations/.test(worker)&&/prevent_negative_product_stock/.test(worker),
  checkoutStockRefresh:/กำลังตรวจสอบสต็อก/.test(app)&&/await loadProducts\(\);const problem=stockProblem/.test(app),
  systemVersion:/version:"5\.3\.1"/.test(worker)&&/v5\.3\.1/.test(html)
};

if(Object.values(checks).some(value=>!value))throw new Error(`feature_check_failed:${JSON.stringify(checks)}`);
console.log(JSON.stringify({ok:true,checks}));
