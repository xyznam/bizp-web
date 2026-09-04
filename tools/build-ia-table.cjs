/* 기능 목록 IA 생성기 — 기능 구분 / 대분류 / 소분류 / 설명 / 회원 유형 3열 → IA_기능목록.html
 *
 * 층의 의미
 *   기능 구분 : 서비스 영역
 *   대분류    : 진입 화면
 *   소분류    : 그 화면에서 들어가는 화면 (부모 행은 소분류 칸을 비운다)
 *
 * 회원 유형 칸은 점 하나가 아니라 세 단계다. 화면 대부분이 유형마다 다른데
 * 점만 찍으면 그 차이가 전부 사라지기 때문이다.
 *   –  : 모듈이 하나도 안 열리거나, LNB data-only-level 로 메뉴에서 빠진 화면
 *   ●  : 대상 모듈이 전부 열림
 *   ◐  : 일부만 열림 — 닫히는 모듈은 '유형별 제한' 칸에 적는다
 *   —  : 모듈로 판정할 수 없고 수동 지정도 없는 경우
 *
 * 분류·설명은 판단이 들어가 자동화하지 않고 tools/ia-cats.json 에 손으로 둔다.
 *
 * 사용: node tools/build-ia-table.cjs [--uid]
 *       --uid 를 주면 피그마 UID General 보드용 JSON 도 함께 내보낸다. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "IA_기능목록.html");
const LNB_SOURCE = "01_홈.html";

global.window = {};
require(path.join(ROOT, "assets", "capability-matrix.js"));
const MATRIX = global.window.UW_MATRIX;

const BY_FILE = {};
Object.keys(MATRIX).forEach(id => { BY_FILE[MATRIX[id].file] = Object.assign({ id }, MATRIX[id]); });

const SPEC = require("./ia-cats.json");
const GROUPS = SPEC.groups;
const EXCLUDE = SPEC.exclude || [];

/* ---------- LNB 게이트 ----------
   LNB 항목의 data-only-level 은 "그 레벨에서만 메뉴에 뜬다"는 뜻이라 모듈 합집합과 어긋날 수 있다.
   콘텐츠 만들기가 그렇다 — 위탁에서도 모듈 두 개가 열리지만 메뉴를 숨겨 실질은 진입할 수 없다. */
function lnbGate() {
  const html = fs.readFileSync(path.join(ROOT, LNB_SOURCE), "utf8");
  const aside = html.slice(html.indexOf('<aside class="uw-lnb">'), html.indexOf("</aside>"));
  const gate = {};
  const navRe = /<nav class="uw-menu"([^>]*)>([\s\S]*?)<\/nav>/g;
  let m;
  while ((m = navRe.exec(aside))) {
    const navLv = (m[1].match(/data-only-level="([^"]+)"/) || [])[1] || null;
    const aRe = /<a href="([^"]+)"([^>]*)>/g;
    let a;
    while ((a = aRe.exec(m[2]))) {
      if (/^https?:/.test(a[1])) continue;
      const lv = (a[2].match(/data-only-level="([^"]+)"/) || [])[1] || navLv;
      if (lv) gate[a[1]] = lv.split(",").map(s => s.trim());
    }
  }
  return gate;
}
const GATE = lnbGate();

/* ---------- 셀 판정 ---------- */
const LEVELS = ["L1", "L2", "L3"];
const MARK = { full: "●", part: "◐", none: "–", menu: "–", "?": "—" };
const LVNAME = { L1: "위탁", L2: "셀프", L3: "대행사" };

/* 자식이 있고 mods 가 없는 부모는 자식들의 모듈 합집합으로 본다 */
function modsOf(item) {
  if (item.mods) return item.mods;
  if (item.kids && item.kids.length) {
    const u = [];
    item.kids.forEach(k => (k.mods || []).forEach(m => { if (u.indexOf(m) < 0) u.push(m); }));
    if (u.length) return u;
  }
  return null;
}

function cellsOf(item) {
  if (item.cells) return item.cells.map(c => ({ mark: c, closed: [], manual: true }));
  const only = modsOf(item);
  return LEVELS.map(lv => {
    const sc = BY_FILE[item.f];
    if (!sc) return { mark: "?", closed: [] };
    const mods = sc.modules || {};
    const keys = only && only.length ? only.filter(k => mods[k]) : Object.keys(mods);
    if (!keys.length) return { mark: "?", closed: [] };
    if (GATE[item.f] && GATE[item.f].indexOf(lv) < 0) return { mark: "menu", closed: [] };
    const open = keys.filter(k => (mods[k].levels || []).indexOf(lv) >= 0);
    const closed = keys.filter(k => (mods[k].levels || []).indexOf(lv) < 0)
      .map(k => (mods[k].fallbackName || mods[k].name).replace(/\s*\([^)]*\)/g, "").trim());
    if (!open.length) return { mark: "none", closed };
    if (!closed.length) return { mark: "full", closed: [] };
    return { mark: "part", closed };
  });
}

function limitText(item, cells) {
  if (item.cells) return "<b>수동 지정</b> — " + item.why;
  if (cells.every(c => c.mark === "?")) return "<b>판정 보류</b> — 모듈이 등재되지 않아 유형별 노출을 정할 수 없다";
  const noneAt = LEVELS.filter((l, i) => cells[i].mark === "none" || cells[i].mark === "menu");
  const partAt = LEVELS.filter((l, i) => cells[i].mark === "part");
  const out = [];
  if (noneAt.length === 2 && noneAt.indexOf("L3") < 0) out.push("화면 전체 — 대행사 전용");
  else noneAt.forEach(l => {
    const i = LEVELS.indexOf(l);
    out.push("<b>" + LVNAME[l] + "</b> 전체" + (cells[i].mark === "menu" ? " (메뉴에서 숨김)" : ""));
  });
  partAt.forEach(l => {
    const c = cells[LEVELS.indexOf(l)];
    const list = c.closed.slice(0, 4).join(", ") + (c.closed.length > 4 ? " 외 " + (c.closed.length - 4) + "건" : "");
    out.push("<b>" + LVNAME[l] + "</b> " + list);
  });
  return out.join("<br>") || "제한 없음";
}

/* ---------- 행 펼치기 ---------- */
/* [{ group, groupNote, isFirstOfGroup, groupRows, major, minor, item }] */
const FLAT = [];
GROUPS.forEach(g => {
  const groupRows = g.items.reduce((s, it) => s + 1 + ((it.kids || []).length), 0);
  let first = true;
  g.items.forEach(it => {
    FLAT.push({ group: g.group, groupNote: g.note, first, groupRows, major: it.name, minor: "", item: it });
    first = false;
    (it.kids || []).forEach(k => {
      FLAT.push({ group: g.group, groupNote: g.note, first: false, groupRows, major: "", minor: k.name, item: k });
    });
  });
});

/* ---------- 검증 ---------- */
const listedFiles = [...new Set(FLAT.map(r => r.item.f))];
const excluded = EXCLUDE.map(e => e.f);
const allFiles = Object.keys(BY_FILE);
const missing = allFiles.filter(f => listedFiles.indexOf(f) < 0 && excluded.indexOf(f) < 0);
const unknown = listedFiles.filter(f => !BY_FILE[f]);
const staleExclude = excluded.filter(f => !BY_FILE[f]);

/* 펼친 화면(같은 파일이 여러 행)은 모듈이 빠짐없이 덮이는지 본다 */
const modGaps = [];
const byFile = {};
FLAT.forEach(r => { if (r.item.mods) (byFile[r.item.f] = byFile[r.item.f] || []).push(...r.item.mods); });
Object.keys(byFile).forEach(f => {
  const have = new Set(byFile[f]);
  const want = Object.keys((BY_FILE[f] || {}).modules || {});
  const miss = want.filter(k => !have.has(k));
  if (miss.length) modGaps.push(f + " 모듈 " + miss.join(","));
});

/* ---------- HTML ---------- */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const today = new Date().toISOString().slice(0, 10);

let rowsHtml = "", stat = { full: 0, part: 0, none: 0, q: 0 }, diffCount = 0, manualCount = 0;
FLAT.forEach(r => {
  const cells = cellsOf(r.item);
  cells.forEach(x => { stat[x.mark === "menu" ? "none" : (x.mark === "?" ? "q" : x.mark)]++; });
  if (new Set(cells.map(x => x.mark)).size > 1) diffCount++;
  if (r.item.cells) manualCount++;
  const sc = BY_FILE[r.item.f] || {};
  const sid = (sc.id || "") + (r.item.mods ? " · " + r.item.mods.join("+") : "");
  rowsHtml +=
    "<tr>" +
    (r.first ? '<td class="grp" rowspan="' + r.groupRows + '">' + esc(r.group) +
      (r.groupNote ? '<span class="grpnote">' + esc(r.groupNote) + "</span>" : "") + "</td>" : "") +
    '<td class="major">' + (r.major ? esc(r.major) : "") + "</td>" +
    '<td class="minor">' + (r.minor ? esc(r.minor) : "") +
      '<span class="sid">' + esc(sid) + "</span></td>" +
    '<td class="desc"><ul><li>' + esc(r.item.d[0]) + "</li><li>" + esc(r.item.d[1]) + "</li></ul></td>" +
    cells.map(x => '<td class="mk m-' + x.mark + '">' + MARK[x.mark] + "</td>").join("") +
    '<td class="lim">' + limitText(r.item, cells) + "</td>" +
    "</tr>\n";
});

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사용자웹 기능 목록 — 비즈플래닛</title>
<!-- 자동 생성 — 고칠 곳은 tools/ia-cats.json (분류·설명) 과 tools/build-ia-table.cjs (판정·표).
     다시 만들기: node tools/build-ia-table.cjs --uid -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="assets/userweb.css">
<style>
html, body { font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', -apple-system, sans-serif; background: var(--bg); }
.wrap { max-width: 1620px; margin: 0 auto; padding: 38px 24px 90px; }
h1 { font-size: 25px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink-900); }
.sub-note { font-size: 13px; font-weight: 500; color: var(--ink-500); margin-top: 8px; line-height: 1.75; }
.sub-note a { color: var(--blue); }

.legend { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
.lg { background: var(--white); border: 1px solid var(--card-border); border-radius: var(--radius-tile); padding: 10px 14px; font-size: 12px; color: var(--ink-600); line-height: 1.6; }
.lg b { font-size: 15px; margin-right: 4px; }
.lg .m-full { color: var(--blue); } .lg .m-part { color: var(--orange); } .lg .m-none { color: var(--ink-300); }

.stats { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.st { background: var(--inset); border-radius: var(--radius-tile); padding: 9px 13px; font-size: 12px; color: var(--ink-600); }
.st b { font-size: 15px; font-weight: 800; color: var(--ink-900); margin-right: 4px; }

.scroll { overflow-x: auto; margin-top: 18px; background: var(--white); border: 1px solid var(--card-border); border-radius: var(--radius-card); }
table { border-collapse: collapse; width: 100%; min-width: 1360px; font-size: 12.5px; }
thead th { background: var(--ink-900); color: #fff; font-size: 12px; font-weight: 700; padding: 11px 10px; text-align: center; white-space: nowrap; letter-spacing: -0.01em; }
thead th.l { text-align: left; }
td { border-bottom: 1px solid var(--divider); padding: 10px; vertical-align: top; line-height: 1.6; }
tbody tr:hover td.major, tbody tr:hover td.minor, tbody tr:hover td.desc, tbody tr:hover td.lim, tbody tr:hover td.mk { background: var(--blue-50); }

td.grp { width: 104px; background: var(--ink-900); color: #fff; font-size: 13px; font-weight: 800; text-align: center; vertical-align: middle; border-bottom: 2px solid var(--white); }
td.grp .grpnote { display: block; margin-top: 7px; font-size: 10px; font-weight: 500; color: rgba(255,255,255,.68); line-height: 1.55; text-align: left; padding: 0 4px; }
td.major { width: 152px; font-weight: 800; color: var(--ink-900); background: var(--inset); }
td.minor { width: 152px; font-weight: 700; color: var(--ink-700); }
td.minor .sid { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; font-weight: 500; color: var(--ink-400); margin-top: 3px; }
td.desc { min-width: 330px; }
td.desc ul { margin: 0; padding-left: 15px; color: var(--ink-700); }
td.desc li { margin: 1px 0; }
td.desc li + li { color: var(--ink-500); }
td.mk { width: 88px; text-align: center; font-size: 17px; font-weight: 800; vertical-align: middle; }
td.m-full { color: var(--blue); }
td.m-part { color: var(--orange); }
td.m-none, td.m-menu { color: var(--ink-300); }
td.lim { min-width: 250px; font-size: 11.5px; color: var(--ink-500); }
td.lim b { color: var(--ink-700); font-weight: 700; }

.excl { background: var(--inset); border-radius: var(--radius-tile); padding: 11px 16px; font-size: 12px; color: var(--ink-600); margin-top: 14px; line-height: 1.7; }
.warn { background: var(--red-bg); color: var(--red); border-radius: var(--radius-tile); padding: 12px 16px; font-size: 12px; margin-top: 14px; line-height: 1.7; }
</style>
</head>
<body data-screen="UW_IA_03">
<div class="wrap">

  <h1>사용자웹 기능 목록</h1>
  <p class="sub-note">
    화면 ${listedFiles.length}개를 기능 구분 ${GROUPS.length} · 대분류 ${FLAT.filter(r => r.major).length} · 소분류 ${FLAT.filter(r => r.minor).length}로 묶었다.
    대분류는 진입 화면이고 소분류는 그 화면에서 들어가는 화면이라, 부모 행은 소분류 칸을 비웠다.<br>
    회원 유형 칸은 <code>assets/capability-matrix.js</code> 와 LNB 게이트에서 자동 판정한다. 생성일 ${today}.
    구조와 흐름은 <a href="IA_구조_플로우.html">IA_구조_플로우.html</a>, 모듈 단위 색인은 <a href="IA_사용자웹.html">IA_사용자웹.html</a> 참조.
  </p>

  <div class="legend">
    <div class="lg"><b class="m-full">●</b> 전체 — 이 기능을 다 쓴다</div>
    <div class="lg"><b class="m-part">◐</b> 일부 — 열리지만 일부가 닫힌다. 닫히는 것은 오른쪽 칸에</div>
    <div class="lg"><b class="m-none">–</b> 없음 — 메뉴에도 없고 들어가도 볼 게 없다</div>
    <div class="lg"><b class="m-none">—</b> 판정 없음 — 모듈로도 수동으로도 정하지 않은 화면</div>
  </div>

  <div class="stats">
    <div class="st"><b>${listedFiles.length}</b>화면 · <b>${FLAT.length}</b>행</div>
    <div class="st"><b>${diffCount}</b>행이 유형마다 다름</div>
    <div class="st"><b>${stat.full}</b>전체 · <b>${stat.part}</b>일부 · <b>${stat.none}</b>없음</div>
    <div class="st"><b>${manualCount}</b>행 수동 지정</div>
  </div>
${EXCLUDE.length ? `
  <div class="excl">
    <b>IA 에서 뺀 화면 ${EXCLUDE.length}건</b> — ${EXCLUDE.map(e => esc((BY_FILE[e.f] || {}).title || e.f) + " (" + esc(e.why) + ")").join(" · ")}
  </div>` : ""}
${(missing.length || unknown.length || modGaps.length || staleExclude.length) ? `
  <div class="warn">
    표와 매트릭스가 어긋난다 —
    ${missing.length ? "표에 빠진 화면 " + missing.length + "건: " + esc(missing.join(", ")) + "<br>" : ""}
    ${unknown.length ? "매트릭스에 없는 화면 " + unknown.length + "건: " + esc(unknown.join(", ")) + "<br>" : ""}
    ${staleExclude.length ? "제외 목록에 있으나 매트릭스에 없는 화면: " + esc(staleExclude.join(", ")) + "<br>" : ""}
    ${modGaps.length ? "펼친 화면인데 어느 행에도 안 잡힌 모듈: " + esc(modGaps.join(" / ")) : ""}
  </div>` : ""}

  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>기능 구분</th>
          <th class="l">대분류</th>
          <th class="l">소분류</th>
          <th class="l">설명</th>
          <th>사장님 회원<br>대행사 위탁</th>
          <th>사장님 회원<br>셀프 운영</th>
          <th>대행사 회원</th>
          <th class="l">유형별 제한</th>
        </tr>
      </thead>
      <tbody>
${rowsHtml}      </tbody>
    </table>
  </div>

</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log("생성: " + path.relative(ROOT, OUT));

/* ============================================================
   UID General 보드용 JSON — --uid
   ============================================================ */
if (process.argv.indexOf("--uid") >= 0) {
  const KIT = path.join(ROOT, "html-to-figma-kit", "output");
  const GEN = path.join(KIT, "general");
  const DESC = path.join(KIT, "descriptions");
  fs.mkdirSync(GEN, { recursive: true });

  const plain = s => String(s).replace(/<br>/g, " / ").replace(/<[^>]+>/g, "");
  const COLUMNS = ["기능 구분", "대분류", "소분류", "설명", "위탁", "셀프", "대행사", "유형별 제한"];

  /* 기능 구분 경계에서 4등분 — 한 보드가 너무 길면 읽히지 않는다 */
  const PARTS = [
    { key: "a", groups: ["로그인/가입", "홈", "콘텐츠"] },
    { key: "b", groups: ["비즈챗", "AI챗봇"] },
    { key: "c", groups: ["매장 정보·AI분석", "요금제·청구"] },
    { key: "d", groups: ["대행사", "계정", "문의·도움", "시스템"] }
  ];

  PARTS.forEach((part, pi) => {
    const rows = [];
    const notes = [];
    part.groups.forEach(gname => {
      const g = GROUPS.find(x => x.group === gname);
      if (!g) return;
      if (g.note) notes.push(g.group + " — " + g.note);
      let first = true;
      FLAT.filter(r => r.group === gname).forEach(r => {
        const cells = cellsOf(r.item);
        rows.push([
          first ? r.group : "",
          r.major, r.minor,
          r.item.d[0] + " / " + r.item.d[1],
          MARK[cells[0].mark], MARK[cells[1].mark], MARK[cells[2].mark],
          plain(limitText(r.item, cells))
        ]);
        first = false;
      });
    });

    const label = "UW_IA_03__" + part.key;
    const g = {
      blocks: [
        pi === 0 ? {
          title: "읽는 법",
          paragraphs: [
            "화면 " + listedFiles.length + "개를 기능 구분 " + GROUPS.length + " · 대분류 " + FLAT.filter(r => r.major).length + " · 소분류 " + FLAT.filter(r => r.minor).length + "로 묶었다.",
            "대분류는 진입 화면이고 소분류는 그 화면에서 들어가는 화면이다. 부모 행은 소분류 칸을 비워 계위가 보이게 했다.",
            EXCLUDE.length ? ("IA 에서 뺀 화면 — " + EXCLUDE.map(e => ((BY_FILE[e.f] || {}).title || e.f) + " (" + e.why + ")").join(" · ")) : ""
          ].filter(Boolean),
          bullets: [
            "● 전체 — 이 기능을 다 쓴다",
            "◐ 일부 — 열리지만 일부가 닫힌다. 닫히는 것은 유형별 제한 칸에 적었다",
            "– 없음 — 메뉴에도 없고 들어가도 볼 게 없다. 메뉴만 숨긴 경우도 여기 넣는다",
            "— 판정 없음 — 모듈로도 수동으로도 정하지 않은 화면"
          ]
        } : {
          title: "이어서",
          paragraphs: ["기호 설명은 첫 보드(UW_IA_03__a)에 있다."]
        },
        { type: "table",
          caption: part.groups.join(" · "),
          note: notes.length ? notes.join("   /   ") : undefined,
          columns: COLUMNS, rows: rows }
      ]
    };
    fs.writeFileSync(path.join(GEN, label + ".json"), JSON.stringify(g, null, 1), "utf8");

    const desc = {
      flags: [
        { kind: "reference", text: "이 보드는 화면 캡처가 아니라 기능 목록 표다. 원본은 IA_기능목록.html 이고 tools/build-ia-table.cjs 가 만든다" }
      ],
      rows: [
        { no: "1", title: "표 읽는 법", nocallout: true, bullets: [
          { text: "왼쪽부터 기능 구분, 대분류, 소분류, 설명, 회원 유형 3열, 유형별 제한" },
          { text: "대분류는 진입 화면이고 소분류는 그 화면에서 들어가는 화면이다. 부모 행은 소분류 칸이 비어 있다" },
          { text: "설명은 두 부분이다. 앞은 무엇을 하는가, 뒤는 어디서 들어가고 무엇과 이어지는가" }
        ]},
        { no: "2", title: "회원 유형 판정", nocallout: true, bullets: [
          { text: "모듈 노출은 capability-matrix.js 가 정본이다" },
          { text: "LNB 게이트를 함께 본다. 콘텐츠 만들기는 위탁에서도 모듈 두 개가 열리지만 메뉴를 숨겨 실질은 진입할 수 없다" },
          { text: "모듈로 판정할 수 없는 화면은 수동으로 지정하고 근거를 유형별 제한 칸에 적는다" }
        ]},
        { no: "3", title: "이 보드가 담은 범위", nocallout: true, bullets: [
          { text: part.groups.join(" · ") + " — " + rows.length + "행" },
          { text: "전체 " + FLAT.length + "행은 네 보드로 나눠 담았다. 기능 구분이 보드에 걸치지 않게 잘랐다" }
        ]}
      ]
    };
    fs.writeFileSync(path.join(DESC, label + ".json"), JSON.stringify(desc, null, 1), "utf8");
    console.log("  UID: general/" + label + ".json (" + rows.length + "행)");
  });
}

console.log("  기능 구분 " + GROUPS.length + " · 대분류 " + FLAT.filter(r => r.major).length +
  " · 소분류 " + FLAT.filter(r => r.minor).length + " · 총 " + FLAT.length + "행 · 화면 " + listedFiles.length);
console.log("  ● " + stat.full + " · ◐ " + stat.part + " · – " + stat.none + " · 판정없음 " + stat.q +
  " · 수동지정 " + manualCount + " · 유형별로 다른 행 " + diffCount);
if (EXCLUDE.length) console.log("  제외: " + EXCLUDE.map(e => ((BY_FILE[e.f] || {}).title || e.f)).join(", "));
if (missing.length) console.log("  ⚠ 표에 빠짐: " + missing.join(", "));
if (unknown.length) console.log("  ⚠ 매트릭스에 없음: " + unknown.join(", "));
if (staleExclude.length) console.log("  ⚠ 제외 목록이 낡음: " + staleExclude.join(", "));
if (modGaps.length) console.log("  ⚠ 펼친 화면의 미커버 모듈: " + modGaps.join(" / "));
if (!missing.length && !unknown.length && !modGaps.length && !staleExclude.length) {
  console.log("  ✓ 제외분을 뺀 " + listedFiles.length + "화면을 빠짐없이 덮고, 펼친 화면의 모듈도 전부 잡혔다");
}
