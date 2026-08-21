self.addEventListener("push",event=>{
  event.waitUntil(self.registration.showNotification("JIGᶻ AGENT",{
    body:"มีรายการใหม่ในศูนย์ควบคุม แตะเพื่อเปิดหน้าหลังบ้าน",
    icon:"/assets/jigz-planet.png",
    badge:"/assets/jigz-planet.png",
    tag:"jigz-admin-update",
    renotify:true,
    silent:false,
    requireInteraction:true,
    vibrate:[180,80,180],
    data:{url:"/admin"}
  }));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"/admin",self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const client of list){if(client.url.startsWith(self.location.origin)){return client.focus().then(()=>client.navigate(target))}}
    return clients.openWindow(target);
  }));
});
