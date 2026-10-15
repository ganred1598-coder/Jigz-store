(() => {
 const modal=document.getElementById('modal');
 const close=document.getElementById('modalClose');
 let previousFocus=null,oldOverflow='',wasOpen=false;
 if(modal){
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','modalTitle');
  close?.setAttribute('aria-label','ปิดหน้าต่าง');
  const focusables=()=>[...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  const sync=()=>{
   const open=!modal.classList.contains('hidden');if(open===wasOpen)return;wasOpen=open;
   if(open){previousFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';requestAnimationFrame(()=>{if(wasOpen)(close||focusables()[0])?.focus({preventScroll:true});});}
   else{document.body.style.overflow=oldOverflow;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  };
  new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});sync();
  modal.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();close?.click();}
   if(event.key!=='Tab')return;
   const list=focusables(),first=list[0],last=list.at(-1);if(!first)return;
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
 }
 document.getElementById('menuButton')?.setAttribute('aria-label','เปิดหรือปิดเมนูหลัก');
 document.getElementById('accountButton')?.setAttribute('aria-label','เปิดบัญชีผู้ใช้');
 document.getElementById('cartButton')?.setAttribute('aria-label','เปิดตะกร้า');
 const toast=document.getElementById('toast');if(toast){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');}
 const banner=document.createElement('div');banner.className='ui-connection';banner.setAttribute('role','status');banner.hidden=true;document.body.append(banner);
 let recoveryTimer;
 const offline=()=>{clearTimeout(recoveryTimer);banner.textContent='ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาเชื่อมต่อก่อนบันทึกข้อมูล';banner.hidden=false;};
 const online=()=>{clearTimeout(recoveryTimer);banner.textContent='อินเทอร์เน็ตกลับมาแล้ว ตรวจสอบรายการก่อนลองบันทึกอีกครั้ง';banner.hidden=false;recoveryTimer=setTimeout(()=>{banner.hidden=true;},6000);};
 window.addEventListener('offline',offline);window.addEventListener('online',online);if(!navigator.onLine)offline();
})();
