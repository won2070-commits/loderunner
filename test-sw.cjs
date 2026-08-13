// sw.js 활성화 로직 시험: 옛 캐시가 있을 때만, 그리고 딱 한 번만 창을 재로드하는가
const fs=require("fs"), path=require("path");
const src=fs.readFileSync(path.join(__dirname,"sw.js"),"utf8");

function makeEnv(existingKeys){
  const store=new Map(existingKeys.map(k=>[k,new Map()]));
  const navigated=[];
  const caches={
    keys:async()=>[...store.keys()],
    delete:async k=>store.delete(k),
    open:async k=>{ if(!store.has(k)) store.set(k,new Map()); const m=store.get(k);
      return { addAll:async()=>{}, put:async(req,res)=>m.set(String(req),res||"r"),
               match:async req=>m.get(String(req)) }; },
    match:async()=>undefined,
  };
  const handlers={};
  const self={
    addEventListener:(t,f)=>{ handlers[t]=f; },
    skipWaiting:async()=>{},
    clients:{ claim:async()=>{}, matchAll:async()=>[{url:"https://x/loderunner/", navigate:async u=>navigated.push(u)}] },
    caches,
  };
  return {self, caches, handlers, navigated, store, Response:function(){ return {}; }};
}
async function run(existing){
  const env=makeEnv(existing);
  const fn=new Function("self","caches","Response","fetch",src);
  fn(env.self, env.caches, env.Response, async()=>({clone:()=>({})}));
  const waits=[];
  await env.handlers.install({waitUntil:p=>waits.push(p)});
  await Promise.all(waits);
  const w2=[];
  await env.handlers.activate({waitUntil:p=>w2.push(p)});
  await Promise.all(w2);
  return env;
}
(async()=>{
  const A=(c,m)=>{ console.log((c?"PASS: ":"FAIL: ")+m); if(!c) process.exitCode=1; };
  // 1) 첫 설치(옛 캐시 없음) → 재로드하지 않는다
  let e = await run([]);
  A(e.navigated.length===0, "첫 설치에서는 창을 건드리지 않음");
  // 2) 옛 캐시가 있으면 → 딱 한 번 재로드
  e = await run(["loderunner-v2"]);
  A(e.navigated.length===1, "옛 캐시 발견 시 1회 재로드 ("+e.navigated.length+")");
  A(![...e.store.keys()].includes("loderunner-v2"), "옛 캐시 삭제");
  // 3) 같은 워커가 다시 활성화돼도 재로드 안 함 (루프 방지)
  const w=[]; await e.handlers.activate({waitUntil:p=>w.push(p)}); await Promise.all(w);
  A(e.navigated.length===1, "재활성화돼도 추가 재로드 없음 ("+e.navigated.length+")");
})();
