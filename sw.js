// 오프라인 캐시: 파일이 index.html 하나뿐이라 캐시도 하나면 충분하다.
// 캐시 이름을 올리면 옛 캐시가 지워진다 — 배포 때 index.html 의 APP_VER 와 같이 올릴 것.
const C = "loderunner-v2";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  // HTML 은 브라우저 HTTP 캐시까지 건너뛰고 받아온다. 안 그러면 배포해도 최대 10분간 옛 파일이 나온다.
  const isDoc = e.request.mode === "navigate" || e.request.destination === "document";
  const req = isDoc ? new Request(e.request.url, { cache: "no-store" }) : e.request;
  e.respondWith(
    fetch(req).then(r => {                             // 네트워크 우선, 성공하면 캐시 갱신
      const copy = r.clone();
      caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
