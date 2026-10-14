(() => {
  let page=1, pages=1, sequence=0, loading=false, heartbeatBusy=false;
  const el=id=>document.getElementById(id);
  const active=()=>!document.hidden&&el("visitors")?.classList.contains("active")&&state.user;
  const timestamp=value=>{
    if(!value)return "—";
    const text=String(value).replace(" ","T");
    const time=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text)?text:text+"Z");
    return Number.isNaN(time.getTime())?"—":time.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"});
  };
  async function load(){
    const own=++sequence;
    loading=true;
    el("visitorRefresh").disabled=true;
    el("visitorMessage").textContent="กำลังอัปเดตข้อมูล…";
    const params=new URLSearchParams({page:String(page),status:el("visitorStatus").value,q:el("visitorSearch").value.trim()});
    try{
      const data=await api("/api/admin/visitors?"+params);
      if(own!==sequence)return;
      page=data.page;pages=data.pages;
      el("visitorTotal").textContent=Number(data.summary.total).toLocaleString("th-TH");
      el("visitorOnline").textContent=Number(data.summary.online).toLocaleString("th-TH");
      el("visitorRows").innerHTML=safeArray(data.users).map(user=>'<tr><td><b>'+esc(user.full_name||user.display_name)+'</b><small>'+esc(user.id)+'</small></td><td>'+esc(user.role)+'</td><td>'+(user.is_online?'<b class="green">● ออนไลน์</b>':'ออฟไลน์')+'</td><td>'+esc(timestamp(user.created_at))+'</td><td>'+esc(timestamp(user.last_seen_at))+'</td></tr>').join("")||'<tr><td colspan="5">ไม่พบผู้เข้าใช้งานตามตัวกรอง</td></tr>';
      el("visitorPage").textContent="หน้า "+page+" / "+pages+" · "+data.total+" รายการ";
      el("visitorPrevious").disabled=page<=1;
      el("visitorNext").disabled=page>=pages;
      el("visitorMessage").textContent="อัปเดตล่าสุด "+timestamp(data.updatedAt);
    }catch(error){
      if(own===sequence)el("visitorMessage").textContent="อัปเดตไม่สำเร็จ ข้อมูลที่แสดงอาจเก่า — "+errorText(error);
    }finally{
      if(own===sequence){loading=false;el("visitorRefresh").disabled=false;}
    }
  }
  async function heartbeat(){
    if(document.hidden||!state.user||heartbeatBusy)return;
    heartbeatBusy=true;
    try{await api("/api/admin/session");}catch{}finally{heartbeatBusy=false;}
  }
  window.loadVisitors=load;
  el("visitorFilters").addEventListener("submit",event=>{event.preventDefault();page=1;load();});
  el("visitorStatus").addEventListener("change",()=>{page=1;load();});
  el("visitorRefresh").addEventListener("click",load);
  el("visitorPrevious").addEventListener("click",()=>{if(page>1){page--;load();}});
  el("visitorNext").addEventListener("click",()=>{if(page<pages){page++;load();}});
  setInterval(()=>{if(active()&&!loading)load();},30000);
  setInterval(heartbeat,120000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){heartbeat();if(active())load();}});
})();
