const fs=require("fs");
const src=fs.readFileSync("/Users/dowonuk/Desktop/Cowork/로드러너/index.html","utf8").match(/<script>([\s\S]*)<\/script>/)[1];
const VER=src.match(/APP_VER = "([^"]+)"/)[1];
const noop=()=>{}; const ctxStub=new Proxy({},{get:()=>noop});
const elStub=()=>({getContext:()=>ctxStub,textContent:"",innerHTML:"",style:{},addEventListener:noop,dataset:{},
                   appendChild:noop,toDataURL:()=>"data:image/png;base64,",width:0,height:0});
global.document={getElementById:elStub,createElement:elStub,head:{appendChild:noop},hidden:false};
global.requestAnimationFrame=noop; global.setInterval=noop; global.setTimeout=noop; global.performance={now:()=>0};
global.URL={createObjectURL:()=>"blob:x"}; global.Blob=function(){};
global.navigator={serviceWorker:{getRegistrations:async()=>[]}};
global.sessionStorage={s:{},getItem(k){return this.s[k]||null},setItem(k,v){this.s[k]=v}};
global.addEventListener=noop;
let replaced=null;
global.location={protocol:"https:",pathname:"/loderunner/",replace:u=>{replaced=u;}};
global.fetch=async()=>({text:async()=>`const APP_VER = "${VER}";`});   // 서버도 같은 버전
const test=`
(async()=>{
  lastCheck=0; state="over";
  await checkFresh();
  const ok = global.__r()===null;
  console.log((ok?"PASS: ":"FAIL: ")+"같은 버전이면 새로고침 안 함");
  if(!ok) process.exitCode=1;
  // 게임 진행 중(점수 있음)에는 새로고침 보류
  lastCheck=0; state="play"; score=500; global.__setDiff();
  await checkFresh();
  const ok2 = global.__r()===null;
  console.log((ok2?"PASS: ":"FAIL: ")+"게임 중에는 새로고침 보류");
  if(!ok2) process.exitCode=1;
})();`;
global.__r=()=>replaced;
global.__setDiff=()=>{ global.fetch=async()=>({text:async()=>'const APP_VER = "9999-new";'}); };
eval(src+"\n"+test);
