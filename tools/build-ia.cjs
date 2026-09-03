/* IA 표 생성기 — capability-matrix.js 를 정본으로 읽어 IA_사용자웹.html 을 만든다.
   표 A : 화면 단위 (메뉴 그룹 · 화면 · Screen ID · 파일 · 노출 레벨 · 모듈 수 · 진입 경로)
   표 B : 화면 x 모듈 (Screen ID · 화면 · 모듈 · 모듈명 · 타입 · L1 · L2 · L3 · 대체 처리)

   메뉴 그룹은 LNB 를 파싱해서 얻는다 — 매트릭스에는 메뉴 구조가 없기 때문.
   LNB 에 없는 화면은 어디서 들어오는지가 곧 IA 이므로, 다른 화면의 링크를 훑어 진입 경로로 채운다.

   사용: node tools/build-ia.cjs   (프로젝트 루트에서) */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LNB_SOURCE = "01_홈.html";   // LNB 정본으로 삼는 화면
const OUT = path.join(ROOT, "IA_사용자웹.html");

/* ---------- 1. 매트릭스 읽기 ---------- */
global.window = {};
require(path.join(ROOT, "assets", "capability-matrix.js"));
const MATRIX = global.window.UW_MATRIX;

/* ---------- 2. LNB 파싱 → 메뉴 그룹 ---------- */
/* nav 블록의 순서가 곧 메뉴 그룹이다. 그룹 이름은 매트릭스에 없어 여기서 붙인다. */
const GROUP_NAMES = ["메인 메뉴", "매장·도움말", "대행사 메뉴"];

function parseLnb() {
  const html = fs.readFileSync(path.join(ROOT, LNB_SOURCE), "utf8");
  const aside = html.slice(html.indexOf('<aside class="uw-lnb">'), html.indexOf("</aside>"));
  const groups = [];
  const navRe = /<nav class="uw-menu"([^>]*)>([\s\S]*?)<\/nav>/g;
  let m, i = 0;
  while ((m = navRe.exec(aside))) {
    const onlyLevel = (m[1].match(/data-only-level="([^"]+)"/) || [])[1] || null;
    const items = [];
    const aRe = /<a href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g;
    let a;
    while ((a = aRe.exec(m[2]))) {
      const label = a[3].replace(/<[^>]*>/g, "").trim();
      const itemLevel = (a[2].match(/data-only-level="([^"]+)"/) || [])[1] || null;
      items.push({ href: a[1], label, itemLevel });
    }
    groups.push({ name: GROUP_NAMES[i] || "메뉴 " + (i + 1), onlyLevel, items });
    i++;
  }
  return groups;
}

/* ---------- 3. 진입 경로 (LNB 밖 화면) ---------- */
/* 공통 셸(LNB·상단바)을 걷어낸 본문에서만 링크를 센다.
   안 그러면 상단 🔔(알림 센터)·LNB 하단 계정 블록 때문에 모든 화면이 모든 화면에서 온다고 나온다.
   셸에서만 걸리는 화면은 따로 "공통 셸"로 표기한다 — 그게 실제 진입 경로이기 때문. */
const SHELL_RE = [
  /<aside class="uw-lnb">[\s\S]*?<\/aside>/g,
  /<header class="uw-topbar">[\s\S]*?<\/header>/g
];
function splitShell(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  let body = html, shell = "";
  SHELL_RE.forEach(re => {
    body = body.replace(re, m => { shell += m; return ""; });
  });
  return { body, shell };
}

function buildInbound(files) {
  const inbound = {}, shellIn = {};
  files.forEach(f => { inbound[f] = []; shellIn[f] = 0; });
  files.forEach(src => {
    let parts;
    try { parts = splitShell(src); } catch (e) { return; }
    files.forEach(dst => {
      if (dst === src) return;
      const hit = s => s.indexOf('href="' + dst) >= 0 || s.indexOf("'" + dst) >= 0;
      if (hit(parts.body)) inbound[dst].push(src);
      else if (hit(parts.shell)) shellIn[dst]++;
    });
  });
  return { inbound, shellIn };
}

/* ---------- 4. 행 만들기 ---------- */
const LEVELS = ["L1", "L2", "L3"];

function screenLevels(sc) {
  const set = new Set();
  Object.values(sc.modules || {}).forEach(m => (m.levels || []).forEach(l => set.add(l)));
  return LEVELS.filter(l => set.has(l));
}

function shortName(file) { return file.replace(/\.html$/, ""); }

const lnbGroups = parseLnb();
const ids = Object.keys(MATRIX);
const files = ids.map(id => MATRIX[id].file).filter(f => fs.existsSync(path.join(ROOT, f)));
const { inbound, shellIn } = buildInbound(files);

/* 파일 → LNB 위치. 외부로 나가는 메뉴 자리(챗봇 데모)는 화면이 아니라 따로 모아 각주로 남긴다. */
const lnbOf = {};
const lnbExternal = [];
lnbGroups.forEach(g => g.items.forEach(it => {
  if (/^https?:/.test(it.href)) { lnbExternal.push({ group: g.name, label: it.label, href: it.href }); return; }
  lnbOf[it.href] = { group: g.name, label: it.label, onlyLevel: it.itemLevel || g.onlyLevel };
}));

/* LNB 항목의 data-only-level 은 "그 레벨에서만 메뉴에 뜬다"는 뜻이라
   모듈 합집합과 다를 수 있다(예: 콘텐츠 만들기 — L1 은 대체 카드만 있어 메뉴에서 숨긴다). */
const SHELL_MAJORITY = 0.5;   // 절반 넘는 화면의 셸에서 걸리면 "공통 셸"로 본다
function viaLabel(inLnb, via, shellCount, total) {
  if (inLnb) {
    if (!inLnb.onlyLevel) return "LNB";
    return "LNB · " + inLnb.onlyLevel.split(",").map(s => s.trim()).join("·") + "만";
  }
  const parts = [];
  if (shellCount > total * SHELL_MAJORITY) parts.push("공통 셸(전 화면)");
  if (via.length > 6) parts.push(via.slice(0, 6).join(", ") + " 외 " + (via.length - 6) + "곳");
  else if (via.length) parts.push(via.join(", "));
  return parts.length ? parts.join(" · ") : "직접 URL";
}

const rowsA = ids.map(id => {
  const sc = MATRIX[id];
  const inLnb = lnbOf[sc.file];
  const lv = screenLevels(sc);
  const via = (inbound[sc.file] || []).map(shortName);
  return {
    id,
    group: inLnb ? inLnb.group : "하위 화면",
    title: sc.title,
    file: sc.file,
    levels: lv,
    lnbLevel: inLnb ? inLnb.onlyLevel : null,
    modules: Object.keys(sc.modules || {}).length,
    via: viaLabel(inLnb, via, shellIn[sc.file] || 0, files.length)
  };
});

/* 메뉴 그룹 순서대로, 그룹 안에서는 LNB 순서 → 나머지는 파일명 순 */
const groupOrder = GROUP_NAMES.concat(["하위 화면"]);
const lnbIndex = {};
let n = 0;
lnbGroups.forEach(g => g.items.forEach(it => { lnbIndex[it.href] = n++; }));
rowsA.sort((a, b) => {
  const ga = groupOrder.indexOf(a.group), gb = groupOrder.indexOf(b.group);
  if (ga !== gb) return ga - gb;
  const ia = lnbIndex[a.file], ib = lnbIndex[b.file];
  if (ia !== undefined && ib !== undefined) return ia - ib;
  return a.file.localeCompare(b.file, "ko");
});

const rowsB = [];
rowsA.forEach(r => {
  const mods = MATRIX[r.id].modules || {};
  Object.keys(mods).forEach(k => {
    const m = mods[k];
    rowsB.push({
      sid: r.id, screen: r.title, mid: k, name: m.name, type: m.type,
      levels: m.levels || [],
      fallback: m.fallback === "agency-card" ? "대행사 카드" :
                m.fallback === "tbd-card" ? "미정 카드" :
                m.fallback ? m.fallback : "",
      fallbackName: m.fallbackName || "",
      perm: m.perm || ""
    });
  });
});

/* ---------- 5. HTML ---------- */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TYPE_KO = {
  view: "조회", stat: "지표", preview: "미리보기", approve: "승인",
  create: "생성", edit: "편집", bulk: "일괄", advanced: "고급"
};

function lvCells(levels) {
  return LEVELS.map(l => '<td class="c">' + (levels.indexOf(l) >= 0 ? "●" : "·") + "</td>").join("");
}

const today = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사용자웹 IA — 비즈플래닛</title>
<!-- 자동 생성 파일 — 직접 고치지 말 것. 고칠 곳은 assets/capability-matrix.js 와 tools/build-ia.cjs.
     다시 만들기: node tools/build-ia.cjs -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="assets/userweb.css">
<style>
html, body { font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', -apple-system, sans-serif; background: var(--bg); }
.ia-wrap { max-width: 1240px; margin: 0 auto; padding: 40px 28px 80px; }
.ia-h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink-900); }
.ia-sub { font-size: 13px; font-weight: 500; color: var(--ink-500); margin-top: 8px; line-height: 1.7; }
.ia-board { background: var(--white); border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 24px; margin-top: 28px; }
.ia-board-title { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink-900); }
.ia-board-desc { font-size: 12px; font-weight: 500; color: var(--ink-500); margin-top: 6px; line-height: 1.7; }
.ia-scroll { overflow-x: auto; margin-top: 16px; }

table.ia { border-collapse: collapse; width: 100%; font-size: 12.5px; }
table.ia th, table.ia td { border-bottom: 1px solid var(--divider); padding: 9px 10px; text-align: left; vertical-align: top; line-height: 1.55; }
table.ia thead th { background: var(--inset); border-bottom: 1px solid var(--card-border); font-size: 11.5px; font-weight: 700; color: var(--ink-600); white-space: nowrap; }
table.ia td.c, table.ia th.c { text-align: center; }
table.ia tbody tr:hover { background: var(--blue-50); }
.ia-grouphead td { background: var(--white); border-bottom: 1px solid var(--card-border); font-size: 12px; font-weight: 800; color: var(--blue); letter-spacing: -0.01em; padding-top: 16px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--ink-600); white-space: nowrap; }
.name { font-weight: 700; color: var(--ink-900); }
.muted { color: var(--ink-500); }
.wrap { min-width: 200px; }
.chip { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-badge); background: var(--inset); color: var(--ink-600); }
.chip.t-view { background: var(--inset); color: var(--ink-600); }
.chip.t-stat { background: var(--purple-bg); color: var(--purple); }
.chip.t-preview { background: var(--blue-50); color: var(--blue-text); }
.chip.t-approve { background: var(--green-bg); color: var(--green); }
.chip.t-create { background: var(--blue-50); color: var(--blue); }
.chip.t-edit { background: var(--orange-bg); color: var(--orange); }
.chip.t-bulk { background: var(--red-bg); color: var(--red); }
.chip.t-advanced { background: var(--purple-bg); color: var(--purple); }
.dot-on { color: var(--blue); font-weight: 800; }
.dot-off { color: var(--ink-300); }
.ia-legend { font-size: 11.5px; color: var(--ink-500); margin-top: 14px; line-height: 1.8; }
.ia-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.ia-stat { background: var(--inset); border-radius: var(--radius-tile); padding: 10px 14px; }
.ia-stat .n { font-size: 17px; font-weight: 800; color: var(--ink-900); }
.ia-stat .l { font-size: 11px; font-weight: 600; color: var(--ink-500); margin-top: 2px; }
</style>
</head>
<body data-screen="UW_IA_01">
<div class="ia-wrap">

  <h1 class="ia-h1">사용자웹 IA</h1>
  <p class="ia-sub">
    <code class="mono">assets/capability-matrix.js</code> 를 정본으로 자동 생성했다. 생성일 ${today}.<br>
    레벨: L1 위탁(대행사가 다 함) · L2 셀프(사장님이 직접) · L3 대행사. 화면 노출 레벨은 그 화면 모듈들의 합집합이다.
  </p>

  <div class="ia-stats">
    <div class="ia-stat"><div class="n">${rowsA.length}</div><div class="l">화면</div></div>
    <div class="ia-stat"><div class="n">${rowsB.length}</div><div class="l">모듈</div></div>
    <div class="ia-stat"><div class="n">${rowsA.filter(r => r.group !== "하위 화면").length}</div><div class="l">LNB 진입</div></div>
    <div class="ia-stat"><div class="n">${rowsB.filter(r => r.levels.indexOf("L1") >= 0).length} / ${rowsB.filter(r => r.levels.indexOf("L2") >= 0).length} / ${rowsB.filter(r => r.levels.indexOf("L3") >= 0).length}</div><div class="l">L1 / L2 / L3 모듈</div></div>
    <div class="ia-stat"><div class="n">${rowsB.filter(r => r.fallback).length}</div><div class="l">대체 카드</div></div>
  </div>

  <!-- ========== 표 A : 화면 단위 ========== -->
  <section class="ia-board" id="ia-a">
    <div class="ia-board-title">A. 화면 목록</div>
    <div class="ia-board-desc">메뉴 그룹 순서대로. "하위 화면"은 LNB 에 없고 다른 화면에서 들어가는 화면이다.</div>
    <div class="ia-scroll">
      <table class="ia">
        <thead>
          <tr>
            <th style="width:32px">#</th>
            <th>화면</th>
            <th>Screen ID</th>
            <th>파일</th>
            <th class="c">L1</th><th class="c">L2</th><th class="c">L3</th>
            <th class="c">모듈</th>
            <th>진입 경로</th>
          </tr>
        </thead>
        <tbody>
${(() => {
  let out = "", lastGroup = null, idx = 0;
  rowsA.forEach(r => {
    if (r.group !== lastGroup) {
      out += `          <tr class="ia-grouphead"><td colspan="9">${esc(r.group)}</td></tr>\n`;
      lastGroup = r.group;
    }
    idx++;
    out += `          <tr>` +
      `<td class="muted">${idx}</td>` +
      `<td class="name wrap">${esc(r.title)}</td>` +
      `<td class="mono">${esc(r.id)}</td>` +
      `<td class="mono">${esc(r.file)}</td>` +
      (r.levels.length
        ? LEVELS.map(l => `<td class="c ${r.levels.indexOf(l) >= 0 ? "dot-on" : "dot-off"}">${r.levels.indexOf(l) >= 0 ? "●" : "·"}</td>`).join("")
        : `<td class="c dot-off" colspan="3" title="모듈이 등재되지 않아 레벨 판정이 없다">—</td>`) +
      `<td class="c muted">${r.modules}</td>` +
      `<td class="muted wrap">${esc(r.via)}</td>` +
      `</tr>\n`;
  });
  return out;
})()}        </tbody>
      </table>
    </div>
    <div class="ia-legend">
      ● 해당 레벨에서 화면이 열린다 · 모듈 = 그 화면에 등재된 기능 블록 수<br>
      — 모듈이 등재되지 않아 레벨 판정이 없는 화면 (${rowsA.filter(r => !r.levels.length).length}건: ${esc(rowsA.filter(r => !r.levels.length).map(r => r.title).join(", ")) || "없음"})<br>
      진입 경로 "LNB"는 좌측 메뉴에서 바로 들어감. "LNB · L2·L3만"은 그 레벨에서만 메뉴에 뜬다는 뜻이라 모듈 합집합과 다를 수 있다${lnbExternal.length ? `<br>
      LNB 자리이지만 화면이 아닌 항목 — ${lnbExternal.map(x => esc(x.label) + ' <span class="mono">' + esc(x.href) + "</span>").join(" · ")}` : ""}
    </div>
  </section>

  <!-- ========== 표 B : 화면 x 모듈 ========== -->
  <section class="ia-board" id="ia-b">
    <div class="ia-board-title">B. 화면 × 모듈</div>
    <div class="ia-board-desc">레벨별로 어떤 기능이 열리고 닫히는지. L1 에서 닫히는 생성·편집 모듈은 대체 카드로 바뀐다.</div>
    <div class="ia-scroll">
      <table class="ia">
        <thead>
          <tr>
            <th>Screen ID</th>
            <th>화면</th>
            <th style="width:44px">모듈</th>
            <th>모듈명</th>
            <th class="c">타입</th>
            <th class="c">L1</th><th class="c">L2</th><th class="c">L3</th>
            <th>L1 대체 처리</th>
          </tr>
        </thead>
        <tbody>
${(() => {
  let out = "", lastSid = null;
  rowsB.forEach(r => {
    const newScreen = r.sid !== lastSid;
    lastSid = r.sid;
    const fb = r.fallback ? (r.fallback + (r.fallbackName ? ' <span class="muted">(' + esc(r.fallbackName) + ")</span>" : "")) : "";
    out += `          <tr${newScreen ? ' style="border-top:1px solid var(--card-border)"' : ""}>` +
      `<td class="mono">${newScreen ? esc(r.sid) : ""}</td>` +
      `<td class="${newScreen ? "name" : "muted"}">${newScreen ? esc(r.screen) : ""}</td>` +
      `<td class="mono">${esc(r.mid)}</td>` +
      `<td class="wrap">${esc(r.name)}</td>` +
      `<td class="c"><span class="chip t-${esc(r.type)}">${TYPE_KO[r.type] || esc(r.type)}</span></td>` +
      LEVELS.map(l => `<td class="c ${r.levels.indexOf(l) >= 0 ? "dot-on" : "dot-off"}">${r.levels.indexOf(l) >= 0 ? "●" : "·"}</td>`).join("") +
      `<td class="muted">${fb}${r.perm ? (fb ? " · " : "") + "권한 " + esc(r.perm) : ""}</td>` +
      `</tr>\n`;
  });
  return out;
})()}        </tbody>
      </table>
    </div>
    <div class="ia-legend">
      타입 — 조회 / 지표 / 미리보기 / 승인 / 생성 / 편집 / 일괄 / 고급<br>
      L1 대체 처리 — "대행사 카드": 그 자리에 대행사가 대신 한다는 안내 카드가 뜬다 · "미정 카드": 요금제·결제 방식 확정 전이라 잠긴 자리
    </div>
  </section>

</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log("생성: " + path.relative(ROOT, OUT));
console.log("  표 A " + rowsA.length + "행 · 표 B " + rowsB.length + "행");
const noGroup = rowsA.filter(r => r.group === "하위 화면").length;
console.log("  LNB 진입 " + (rowsA.length - noGroup) + " · 하위 화면 " + noGroup);
