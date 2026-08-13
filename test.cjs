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

// 터치패드 버튼 → 입력 반영 점검 (setPointerCapture 예외에 죽지 않아야 한다)
(function padCheck(){
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const ok = /try\{\s*ev\.target\.setPointerCapture/.test(html);
  console.log(ok ? "PASS: 터치패드 포인터캡처 예외 방어" : "FAIL: 터치패드 포인터캡처 예외 방어");
  if(!ok) process.exitCode = 1;
})();
