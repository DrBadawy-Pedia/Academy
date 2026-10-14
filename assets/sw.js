self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>/dbp|badawy|academy/i.test(k)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(req.mode==='navigate' || /\.(?:html?|js)$/i.test(url.pathname)){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
  }
});
