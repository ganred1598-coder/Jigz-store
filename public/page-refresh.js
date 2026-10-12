(() => {
  "use strict";
  if (document.getElementById("pageRefreshButton")) return;
  const button = document.createElement("button");
  button.id = "pageRefreshButton";
  button.type = "button";
  button.setAttribute("aria-label", "รีเฟรชหน้า");
  button.title = "รีเฟรชหน้า";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg><span>รีเฟรช</span>';
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (navigator.onLine === false) {
      window.alert("ยังไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองรีเฟรชอีกครั้ง");
      return;
    }
    if (!window.confirm("รีเฟรชหน้านี้หรือไม่? ข้อมูลที่ยังไม่ได้บันทึกอาจหาย กรุณารอให้การบันทึกหรืออัปโหลดเสร็จก่อน")) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.querySelector("span").textContent = "กำลังรีเฟรช…";
    window.location.reload();
  });
  document.body.append(button);
})();
