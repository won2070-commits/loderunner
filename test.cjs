// 로드러너 게임 로직 점검: node test.cjs
// index.html 의 <script> 를 그대로 꺼내 DOM 스텁 위에서 돌린다.
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];

const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop });
const elStub = () => ({ getContext: () => ctxStub, textContent: "", innerHTML: "", style: {}, addEventListener: noop,
                        dataset: {}, appendChild: noop, toDataURL: () => "data:image/png;base64,", width: 0, height: 0 });
global.document = { getElementById: elStub, createElement: elStub, head: { appendChild: noop }, hidden: false };
global.addEventListener = noop; global.requestAnimationFrame = noop;
global.setInterval = noop; global.setTimeout = noop; global.performance = { now: () => 0 };
global.URL = { createObjectURL: () => "blob:stub" }; global.Blob = function(){};
global.navigator = { serviceWorker: null }; global.location = { protocol: "file:" };

const checks = `
const step = n => { for(let i=0;i<n;i++) update(); };
const A = (c,m) => { if(!c){ console.error("FAIL:", m); process.exitCode = 1; } else console.log("PASS:", m); };

// 레벨 데이터
LEVELS.forEach((lv,i)=>{
  A(lv.length===H, \`레벨 \${i+1} 행 수\`);
  A(lv.every(r=>r.length===W), \`레벨 \${i+1} 열 수\`);
  A((lv.join("").match(/&/g)||[]).length===1, \`레벨 \${i+1} 시작 위치\`);
});

die = () => {};                                  // 점검 중 사망 무시
enemies.length = 0; grace = 0;

// 이동 / 사다리 / 밧줄 / 낙하
player.x=player.tx=18; player.y=player.ty=14; player.lock=0;
keys.up=true; step(140); keys.up=false;
A(player.y<=9, "사다리 오르기 (y="+player.y+")");
keys.down=true; step(160); keys.down=false;
A(player.y===14, "사다리 내려가기");
player.x=player.tx=13; player.y=player.ty=9; step(60);
A(player.y===10, "지지대 없으면 낙하");
player.x=player.tx=12; player.y=player.ty=6; step(30);
A(player.y===6, "밧줄에 매달림");
keys.right=true; step(30); keys.right=false;
A(player.x>12, "밧줄 이동");

// 파기 → 신선한 구멍이면 적이 기어나옴
player.x=player.tx=3; player.y=player.ty=7; player.lock=0;
dig(1); step(2);
let h = holes[0];
A(!!h && grid[h.y][h.x]===".", "파기 → 구멍 생성");
enemies.push(mk(h.x,h.y)); step(TRAP+60);
A(enemies[0] && enemies[0].y < h.y, "신선한 구멍 → 적 탈출");
enemies.length=0; holes.length=0; grid[h.y][h.x]="#";

// 오래된 구멍 → 적 매몰 사망 + 리스폰
player.x=player.tx=3; player.y=player.ty=7; player.lock=0;
dig(1); step(160); h = holes[0];
const doomed = mk(h.x,h.y); enemies.push(doomed);
const s0 = score; step(200);
A(!enemies.includes(doomed), "오래된 구멍 → 적 매몰");
A(score-s0 >= 400, "매몰 점수 +400");
A(enemies.length === 1, "적 리스폰");
A(grid[h.y][h.x] === "#", "구멍 자동 복구");
enemies.length = 0; holes.length = 0;

// 플레이어도 메워지는 벽돌에 깔리면 사망 (아래가 막힌 두꺼운 바닥)
let dead = 0; die = () => { dead++; };
grid[9][4] = "#";
player.x=player.tx=3; player.y=player.ty=7; player.lock=0;
dig(1); step(2); h = holes[0];
player.x=player.tx=h.x; player.y=player.ty=h.y; step(REGEN+20);
A(dead > 0, "구멍에 갇힌 채 복구되면 사망");
grid[9][4] = "."; die = () => {}; holes.length = 0;

// 적 머리 밟기
enemies.length = 0; enemies.push(mk(10,7));
A(supported(10,6,player), "적 머리 위에 설 수 있음");

// 금괴 → 탈출 사다리 → 클리어
enemies.length = 0;
grid[7][6] = "$"; const g0 = goldLeft, s1 = score;
player.x=player.tx=6; player.y=player.ty=7; step(2);
A(goldLeft===g0-1 && score-s1===250, "금괴 수집 +250");
for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(grid[y][x]==="$"){ grid[y][x]="."; goldLeft--; }
goldLeft = 1; grid[7][8] = "$"; player.x=player.tx=8; step(2);
A(goldLeft===0 && escapeOpen && tile(0,5)==="H", "금괴 0 → 탈출 사다리 열림");
player.x=player.tx=0; player.y=player.ty=14; player.lock=0;
keys.up=true; step(220); keys.up=false;
A(state==="clear", "탈출 사다리로 꼭대기 도달 → 클리어");

// 적 AI 추적
state="play"; grace=0; enemies.length=0; enemies.push(mk(5,9));
const before = enemies[0].x + "," + enemies[0].y;
step(120);
A(before !== enemies[0].x+","+enemies[0].y, "적이 BFS로 추적 이동");

console.log(process.exitCode ? "\\n실패 있음" : "\\n전부 통과");
`;
eval(src + "\n" + checks);

// 터치패드 점검: 좌표 추적형 입력(빗나감·미끄러짐 흡수) + 히트영역 확장 + 배치
(function padCheck(){
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const cases = [
    ["좌표로 버튼 탐색(elementFromPoint)", /elementFromPoint/],
    ["미끄러지면 키 전환(pointermove)", /pad\.addEventListener\("pointermove"/],
    ["손가락별 추적", /fingers = new Map\(\)/],
    ["히트영역 확장(투명 테두리 5px)", /border:5px solid transparent/],
    ["하단 들어올림(safe-area + 14px)", /env\(safe-area-inset-bottom,0px\) \+ 14px/],
    ["가로모드: 게임판 폭 예약(버튼과 분리)", /100vw - 280px/],
    ["가로모드: 버튼 세로 중앙", /top:28px;bottom:0;align-items:center/],
  ];
  for(const [n,re] of cases){ const ok=re.test(html); console.log((ok?"PASS: ":"FAIL: ")+n); if(!ok) process.exitCode=1; }
})();

// 모바일 UX 점검: 탭 재시작 · 가로모드 레이아웃 · 버튼 클러스터
(function mobileCheck(){
  const h = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const cases = [
    ["게임오버 화면 탭 재시작", /getElementById\("msg"\)\.addEventListener\("pointerdown", tapRestart\)/],
    ["캔버스 탭 재시작", /cv\.addEventListener\("pointerdown", tapRestart\)/],
    ["가로모드: 화면 높이에 맞춤", /orientation:landscape\) and \(max-height:560px\)[\s\S]{0,400}height:calc\(100dvh/],
    ["가로모드: 제목·안내 숨김", /orientation:landscape\)[\s\S]{0,200}h1,\.help\{display:none\}/],
    ["방향키 클러스터 좌측", /#pad \.nav\{grid-template-columns/],
    ["파기 버튼 우측", /#pad \.dg\{grid-template-columns/],
    ["세로모드 가로전환 안내", /가로로 눕히면/],
  ];
  for(const [n,re] of cases){
    const ok = re.test(h);
    console.log((ok ? "PASS: " : "FAIL: ") + n);
    if(!ok) process.exitCode = 1;
  }
})();

// 자동 업데이트 점검
(function updateCheck(){
  const h = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const s = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
  const cases = [
    ["APP_VER 선언", /const APP_VER = "[\d.\-]+"/],
    ["버전 화면 표시", /\$\("vr"\)\.textContent/],
    ["서버 버전 확인(no-store)", /fetch\(location\.pathname \+ "\?fresh=" \+ now, \{cache:"no-store"\}\)/],
    ["새로고침 루프 방지", /sessionStorage\.setItem\("lr_reloaded"/],
    ["복귀 시 확인", /visibilitychange[\s\S]{0,60}checkFresh/],
    ["SW: HTML은 no-store로 받기", /new Request\(e\.request\.url, \{ cache: "no-store" \}\)/],
  ];
  let bad = 0;
  for(const [n,re] of cases){ const ok = re.test(h) || re.test(s); console.log((ok?"PASS: ":"FAIL: ")+n); if(!ok) bad=1; }
  // 캐시 이름과 APP_VER 를 같이 올렸는지
  const cache = s.match(/const C = "loderunner-(v\d+)"/);
  console.log(cache ? "PASS: SW 캐시 버전 "+cache[1] : "FAIL: SW 캐시 이름");
  if(bad) process.exitCode = 1;
})();

// 모바일 선택(파란 블럭) 방지 점검
(function selectionCheck(){
  const h = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const cases = [
    ["웹킷 선택 방지(사파리)", /-webkit-user-select:none/],
    ["길게 눌러도 콜아웃 없음", /-webkit-touch-callout:none/],
    ["selectstart 차단", /"contextmenu","selectstart","dragstart"/],
    ["touchstart 기본동작 차단", /addEventListener\("touchstart", ev=>ev\.preventDefault\(\), \{passive:false\}\)/],
    ["더블탭 확대 방지", /touch-action:manipulation/],
  ];
  for(const [n,re] of cases){ const ok=re.test(h); console.log((ok?"PASS: ":"FAIL: ")+n); if(!ok) process.exitCode=1; }
})();
