// 오프라인 캐시 + 자기 치유.
// 캐시 이름은 배포 때 index.html 의 APP_VER 와 같이 올린다.
const C = "loderunner-v4";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.some(k => k !== C);              // 옛 캐시가 있었다 = 업데이트로 켜진 워커
    await Promise.all(keys.filter(k => k !== C).map(k => caches.delete(k)));
    await self.clients.claim();
    // 옛 페이지를 붙잡고 있던 창을 새 파일로 다시 불러온다.
    // (옛 index.html 에는 자동 갱신 코드가 없어서, 이걸 안 하면 스스로 못 풀려난다)
    // 표식을 캐시에 남겨 이 버전에서는 딱 한 번만 — 재로드 루프를 원천 차단한다.
    const box = await caches.open(C);
    if(hadOld && !(await box.match("__healed"))){
      await box.put("__healed", new Response("1"));
      const ws = await self.clients.matchAll({ type: "window" });
      for(const w of ws){ try{ await w.navigate(w.url); }catch(_){} }
    }
  })());
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
