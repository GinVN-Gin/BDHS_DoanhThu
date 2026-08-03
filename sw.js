const CACHE_NAME = "bdhs-v3.3.4-conflict-safe-merge";
const CORE_ASSETS = ["./","./index.html","./manifest.webmanifest","./css/style.css","./js/app.js","./js/cloud-sync.js","./js/excel-export.js","./js/ui-refresh.js","./js/pwa.js","./vendor/jszip.min.js","./BDHS_Excel_Thang_Official_Template.xlsx","./icons/icon-192.png","./icons/icon-512.png","./assets/ha-suong-logo.png","./assets/ha-suong-default-bg.png","./assets/ha-suong-app-bg.png"];
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_ASSETS)));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put("./index.html",copy));return response}).catch(()=>caches.match("./index.html")));return;
  }
  event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(request,copy))}return response}).catch(()=>caches.match(request)));
});
