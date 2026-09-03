/* IA 지도 생성기 — L0 사이트맵 트리 + 콘텐츠 태스크 플로우 → IA_구조_플로우.html

   표(IA_사용자웹.html)가 "색인"이라면 이 문서는 "지도"다.
   - L0 트리 : 하이라키 전용. 화살표를 그리지 않는다 — 소속만 본다.
   - 콘텐츠 플로우 : flow 전용. 레벨(L1·L2·L3)에서 갈리는 지점을 색으로 오버레이한다.

   트리의 부모는 자동 추론하지 않는다. 링크 그래프로 뽑으면 알림 센터가 전 화면과 이어져
   읽히지 않고, "어느 화면 밑에 두는 게 맞나"는 판단의 영역이기 때문이다.
   대신 화면의 브레드크럼(상단바 "A › B")을 정본으로 삼아 손으로 짰고,
   생성 시 매트릭스와 대조해 빠지거나 중복된 화면이 있으면 경고한다.

   사용: node tools/build-ia-map.cjs */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "IA_구조_플로우.html");

global.window = {};
require(path.join(ROOT, "assets", "capability-matrix.js"));
const MATRIX = global.window.UW_MATRIX;

/* 파일 → { id, title, levels } */
const BY_FILE = {};
Object.keys(MATRIX).forEach(id => {
  const sc = MATRIX[id];
  const set = new Set();
  Object.values(sc.modules || {}).forEach(m => (m.levels || []).forEach(l => set.add(l)));
  BY_FILE[sc.file] = { id, title: sc.title, levels: ["L1", "L2", "L3"].filter(l => set.has(l)) };
});

/* ============================================================
   L0 사이트맵 트리 — 손으로 짠 소속. note 는 그 화면에 어떻게 들어가는지.
   ============================================================ */
const TREE = [
  { group: "로그인 전", note: "서비스에 들어오기까지", nodes: [
    { f: "21_로그인.html" },
    { f: "21_회원가입.html", kids: [{ f: "22_약관정책.html" }] },
    { f: "19_초대가입.html", note: "초대 문자 링크로만" },
    { f: "10_온보딩.html", note: "가입 직후 자동" }
  ]},

  { group: "메인 메뉴", note: "LNB 1군", nodes: [
    { f: "01_홈.html", kids: [
      { f: "01_홈_미결제.html", note: "미결제 상태 변형" },
      { f: "07_마케팅계획.html" },
      { f: "08_실행결과리포트.html" },
      { f: "27_대행사요청함.html" }
    ]},
    { f: "02_콘텐츠검토.html", kids: [{ f: "02_발행이력.html" }] },
    { f: "03_콘텐츠만들기.html", note: "메뉴는 L2·L3에만" },
    { f: "04_비즈챗문자.html" },
    { ext: "AI 챗봇 ↗", note: "메뉴 자리가 외부 데모로 연결됨", kids: [
      { f: "05_AI챗봇.html", note: "기존 화면 — URL 직접" }
    ]}
  ]},

  { group: "매장·도움말", note: "LNB 2군", nodes: [
    { f: "06_우리매장정보.html", kids: [
      { f: "98_매장설정.html", note: "온보딩 직후·신규 등록 시" },
      { f: "06_우리매장정보_수정.html" },
      { f: "16_마케팅전략상세.html", kids: [{ f: "16_유사업체비교.html" }] },
      { f: "15_AI학습현황.html" },
      { f: "99_매장자료관리.html" },
      { f: "20_함께쓰는사람.html" }
    ]},
    { f: "11_도움말.html", kids: [{ f: "11_자주묻는질문.html" }] }
  ]},

  { group: "대행사 메뉴", note: "LNB 3군 · L3 전용", nodes: [
    { f: "17_대행사홈.html" },
    { f: "12_매장목록.html", note: "신규 등록 → 매장 정보 설정" },
    { f: "17_요청관리.html" },
    { f: "17_직원관리.html" },
    { f: "09_담당매장청구.html", kids: [{ f: "09_청구그룹상세.html" }] },
    { f: "09_대행사정산.html" }
  ]},

  { group: "공통 셸", note: "메뉴가 아니라 상단바·LNB 하단에서", nodes: [
    { f: "18_알림센터.html", note: "상단 🔔" },
    { f: "23_내계정.html", note: "LNB 하단 계정 블록", kids: [
      { f: "09_요금제비용.html", note: "L1·L2 청구 정본", kids: [
        { f: "25_요금제변경.html" },
        { f: "24_해지.html" },
        { f: "26_결제문제.html" }
      ]}
    ]}
  ]},

  { group: "시스템", note: "사용자가 찾아가지 않는 화면", nodes: [
    { f: "28_오류.html", note: "오류·차단 시 자동" }
  ]}
];

/* ============================================================
   콘텐츠 태스크 플로우 — 화면 흐름 + 상태 전이 + 레벨 분기
   ============================================================ */
const LV = { L1: "위탁", L2: "셀프", L3: "대행사" };

const FLOW = {
  /* ① 콘텐츠가 만들어지는 두 경로 */
  origins: [
    { key: "sched", title: "스케줄 자동 생성", screen: "07_마케팅계획.html",
      steps: ["제안 주기 설정", "발행 며칠 전 AI가 알아서 생성"],
      note: "사람이 보지 않은 채 쌓이므로 검수 큐가 반드시 필요하다" },
    { key: "adhoc", title: "즉석 생성", screen: "03_콘텐츠만들기.html",
      steps: ["① 소식 유형 · ② 한 줄 입력 · ③ 채널", "생성 옵션(이번 글만 다르게)"],
      note: "승인권자가 본인이면 큐를 건너뛴다" }
  ],
  /* 생성에 쓰이는 정본 */
  feeds: { screen: "16_마케팅전략상세.html", what: "말투 · 글 길이 · 소재 키워드 · 이미지 스타일" },

  /* ② 승인권자 판정 */
  reviewer: [
    { cond: "L2", who: "사장님 본인", why: "대행사가 없어 항상 모드 A" },
    { cond: "L1", who: "사장님", why: "제작은 대행사, 승인은 사장님" },
    { cond: "L3 · 모드 A", who: "사장님", why: "사장님 검수형" },
    { cond: "L3 · 모드 B", who: "대행사", why: "대행사 위임형" }
  ],

  /* ③ 레벨별 트랙 — 검수 이후가 갈린다 */
  tracks: [
    { lv: "L2", label: "L2 셀프", chain: [
        { t: "검수 대기", k: "state" },
        { t: "승인", k: "act" },
        { t: "승인 완료", k: "end", note: "종착 — 사장님이 직접 채널에 올림. 발행으로 간주" }
      ],
      neg: { t: "삭제", note: "넘길 상대가 없어 상태를 남기지 않고 지운다" } },

    { lv: "L1", label: "L1 위탁", chain: [
        { t: "검수 대기", k: "state" },
        { t: "승인", k: "act" },
        { t: "등록 대기", k: "state" },
        { t: "대행사가 채널 등록", k: "act" },
        { t: "URL 입력", k: "act", note: "블로그는 필수" },
        { t: "발행 완료", k: "end" }
      ],
      neg: { t: "반려 → 수정 요청", note: "사유를 대행사에 전달 → 대행사가 재작업 → 다시 검수 대기" } },

    { lv: "L3", label: "L3 대행사 · 모드 B", chain: [
        { t: "검수 대기", k: "state" },
        { t: "검수 완료 · 발행 등록", k: "act" },
        { t: "등록 대기", k: "state" },
        { t: "채널 등록", k: "act" },
        { t: "URL 입력", k: "act" },
        { t: "발행 완료", k: "end" }
      ],
      neg: null, negNote: "대행사에는 반려권이 없다 (모드 A면 사장님께 승인 요청으로 넘어간다)" }
  ],

  /* 되돌아가는 경로 */
  loops: [
    { from: "AI 다시 쓰기", to: "다시 쓰는 중 → 검수 대기", where: "전 레벨 공통 · 02·03 모두" },
    { from: "L1 반려", to: "대행사 재작업 → 검수 대기", where: "L1만" }
  ],

  /* ④ 결과 확인 */
  after: [
    { screen: "02_발행이력.html", what: "발행·반려 전체 이력" },
    { screen: "08_실행결과리포트.html", what: "조회수·성과 집계" }
  ]
};

/* ============================================================
   검증 — 트리가 매트릭스 39화면을 정확히 한 번씩 덮는가
   ============================================================ */
const seen = [];
(function walk(nodes) {
  nodes.forEach(n => { if (n.f) seen.push(n.f); if (n.kids) walk(n.kids); });
})(TREE.reduce((a, g) => a.concat(g.nodes), []));

const allFiles = Object.keys(BY_FILE);
const missing = allFiles.filter(f => seen.indexOf(f) < 0);
const dup = seen.filter((f, i) => seen.indexOf(f) !== i);
const unknown = seen.filter(f => !BY_FILE[f]);

/* ============================================================
   HTML
   ============================================================ */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const today = new Date().toISOString().slice(0, 10);

function lvBadges(levels) {
  if (!levels || !levels.length) return '<span class="lv lv-none" title="모듈 미등재">—</span>';
  if (levels.length === 3) return '<span class="lv lv-all">전 레벨</span>';
  return levels.map(l => '<span class="lv lv-' + l + '">' + l + "</span>").join("");
}

function nodeHtml(n, depth) {
  if (n.ext) {
    return '<li class="t-node t-ext"><div class="t-row">' +
      '<span class="t-title">' + esc(n.ext) + "</span>" +
      '<span class="t-note">' + esc(n.note || "") + "</span>" +
      "</div>" + kidsHtml(n, depth) + "</li>";
  }
  const meta = BY_FILE[n.f];
  if (!meta) return '<li class="t-node t-miss"><div class="t-row"><span class="t-title">' + esc(n.f) + " (매트릭스에 없음)</span></div></li>";
  return '<li class="t-node"><div class="t-row">' +
    '<span class="t-title">' + esc(meta.title) + "</span>" +
    lvBadges(meta.levels) +
    '<span class="t-file">' + esc(n.f.replace(/\.html$/, "")) + "</span>" +
    (n.note ? '<span class="t-note">' + esc(n.note) + "</span>" : "") +
    "</div>" + kidsHtml(n, depth) + "</li>";
}
function kidsHtml(n, depth) {
  if (!n.kids || !n.kids.length) return "";
  return '<ul class="t-kids">' + n.kids.map(k => nodeHtml(k, depth + 1)).join("") + "</ul>";
}

const treeHtml = TREE.map(g =>
  '<section class="t-group">' +
    '<div class="t-group-head"><span class="t-group-name">' + esc(g.group) + "</span>" +
      '<span class="t-group-note">' + esc(g.note) + "</span></div>" +
    '<ul class="t-root">' + g.nodes.map(n => nodeHtml(n, 0)).join("") + "</ul>" +
  "</section>"
).join("\n");

function scRef(file) {
  const m = BY_FILE[file];
  return m ? '<b>' + esc(m.title) + '</b> <span class="mono">' + esc(file.replace(/\.html$/, "")) + "</span>" : esc(file);
}

const flowOrigins = FLOW.origins.map(o =>
  '<div class="fx-card fx-origin">' +
    '<div class="fx-card-title">' + esc(o.title) + "</div>" +
    '<div class="fx-card-screen">' + scRef(o.screen) + "</div>" +
    "<ul class=\"fx-steps\">" + o.steps.map(s => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
    '<div class="fx-card-note">' + esc(o.note) + "</div>" +
  "</div>"
).join('<div class="fx-or">또는</div>');

const reviewerHtml = FLOW.reviewer.map(r =>
  '<div class="fx-rv"><span class="fx-rv-cond">' + esc(r.cond) + "</span>" +
  '<span class="fx-rv-arrow">→</span>' +
  '<span class="fx-rv-who">' + esc(r.who) + "</span>" +
  '<span class="fx-rv-why">' + esc(r.why) + "</span></div>"
).join("");

const tracksHtml = FLOW.tracks.map(t =>
  '<div class="fx-track fx-' + t.lv + '">' +
    '<div class="fx-track-head"><span class="lv lv-' + t.lv + '">' + t.lv + "</span>" +
      '<span class="fx-track-label">' + esc(t.label) + "</span></div>" +
    '<div class="fx-chain">' +
      t.chain.map((c, i) =>
        (i ? '<span class="fx-arrow">→</span>' : "") +
        '<span class="fx-n fx-' + c.k + '"' + (c.note ? ' title="' + esc(c.note) + '"' : "") + ">" + esc(c.t) +
        (c.note ? '<em>' + esc(c.note) + "</em>" : "") + "</span>"
      ).join("") +
    "</div>" +
    '<div class="fx-neg">' +
      (t.neg
        ? '<span class="fx-neg-tag">부정 액션</span><span class="fx-n fx-neg-n">' + esc(t.neg.t) + "</span>" +
          '<span class="fx-neg-note">' + esc(t.neg.note) + "</span>"
        : '<span class="fx-neg-tag">부정 액션</span><span class="fx-neg-note">' + esc(t.negNote) + "</span>") +
    "</div>" +
  "</div>"
).join("");

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사용자웹 IA 지도 — 비즈플래닛</title>
<!-- 자동 생성 — 고칠 곳은 tools/build-ia-map.cjs (트리 소속·플로우는 그 안의 TREE·FLOW 상수).
     다시 만들기: node tools/build-ia-map.cjs -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="assets/userweb.css">
<style>
html, body { font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', -apple-system, sans-serif; background: var(--bg); }
.ia-wrap { max-width: 1280px; margin: 0 auto; padding: 40px 28px 90px; }
.ia-h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink-900); }
.ia-sub { font-size: 13px; font-weight: 500; color: var(--ink-500); margin-top: 8px; line-height: 1.75; }
.ia-board { background: var(--white); border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 26px 28px; margin-top: 26px; }
.ia-board-title { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink-900); }
.ia-board-desc { font-size: 12.5px; font-weight: 500; color: var(--ink-500); margin-top: 6px; line-height: 1.75; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--ink-400); }

/* ---- 레벨 뱃지 ---- */
.lv { display: inline-block; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: var(--radius-badge); margin-left: 6px; letter-spacing: -0.01em; }
.lv-L1 { background: var(--purple-bg); color: var(--purple); }
.lv-L2 { background: var(--green-bg); color: var(--green); }
.lv-L3 { background: var(--blue-50); color: var(--blue); }
.lv-all { background: var(--inset); color: var(--ink-500); }
.lv-none { background: var(--inset); color: var(--ink-300); }

/* ================= L0 트리 ================= */
.t-cols { columns: 2; column-gap: 34px; margin-top: 18px; }
.t-group { break-inside: avoid; margin-bottom: 26px; }
.t-group-head { display: flex; align-items: baseline; gap: 8px; padding-bottom: 8px; border-bottom: 2px solid var(--ink-900); }
.t-group-name { font-size: 14px; font-weight: 800; color: var(--ink-900); letter-spacing: -0.02em; }
.t-group-note { font-size: 11px; font-weight: 600; color: var(--ink-400); }

ul.t-root, ul.t-kids { list-style: none; margin: 0; padding: 0; }
ul.t-root { margin-top: 4px; }
ul.t-kids { margin-left: 11px; padding-left: 13px; border-left: 1px solid var(--card-border); }
li.t-node { position: relative; }
ul.t-kids > li.t-node::before {
  content: ""; position: absolute; left: -13px; top: 15px;
  width: 9px; height: 1px; background: var(--card-border);
}
.t-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 4px; padding: 5px 0; }
.t-title { font-size: 13px; font-weight: 700; color: var(--ink-900); letter-spacing: -0.01em; }
.t-file { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; color: var(--ink-400); margin-left: 6px; }
.t-note { font-size: 11px; font-weight: 500; color: var(--ink-500); margin-left: 6px; }
li.t-ext > .t-row .t-title { color: var(--blue); }
li.t-miss > .t-row .t-title { color: var(--red); }

/* ================= 콘텐츠 플로우 ================= */
.fx-stage { margin-top: 22px; }
.fx-stage-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.fx-stage-no { width: 22px; height: 22px; border-radius: 50%; background: var(--ink-900); color: #fff; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fx-stage-title { font-size: 14px; font-weight: 800; color: var(--ink-900); letter-spacing: -0.02em; }
.fx-stage-desc { font-size: 11.5px; font-weight: 500; color: var(--ink-500); }

.fx-row { display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap; }
.fx-card { flex: 1; min-width: 260px; border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 16px 18px; background: var(--white); }
.fx-origin { border-color: var(--blue-border); background: var(--blue-50); }
.fx-card-title { font-size: 13.5px; font-weight: 800; color: var(--ink-900); }
.fx-card-screen { font-size: 12px; color: var(--ink-600); margin-top: 5px; }
.fx-steps { margin: 10px 0 0; padding-left: 16px; font-size: 12px; color: var(--ink-700); line-height: 1.8; }
.fx-card-note { font-size: 11.5px; color: var(--ink-500); margin-top: 9px; line-height: 1.65; padding-top: 8px; border-top: 1px dashed var(--card-border); }
.fx-or { align-self: center; font-size: 11px; font-weight: 700; color: var(--ink-400); padding: 0 2px; }

.fx-feed { display: flex; align-items: center; gap: 10px; margin-top: 12px; background: var(--inset); border-radius: var(--radius-tile); padding: 11px 16px; font-size: 12px; color: var(--ink-600); }
.fx-feed b { color: var(--ink-900); }

.fx-rv { display: flex; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--divider); font-size: 12.5px; }
.fx-rv:last-child { border-bottom: 0; }
.fx-rv-cond { font-weight: 800; color: var(--ink-900); min-width: 92px; }
.fx-rv-arrow { color: var(--ink-300); }
.fx-rv-who { font-weight: 700; color: var(--blue); min-width: 84px; }
.fx-rv-why { font-size: 11.5px; color: var(--ink-500); }

.fx-track { border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 15px 18px; margin-top: 10px; border-left-width: 4px; }
.fx-track.fx-L1 { border-left-color: var(--purple); }
.fx-track.fx-L2 { border-left-color: var(--green); }
.fx-track.fx-L3 { border-left-color: var(--blue); }
.fx-track-head { display: flex; align-items: center; gap: 4px; }
.fx-track-head .lv { margin-left: 0; }
.fx-track-label { font-size: 13px; font-weight: 800; color: var(--ink-900); margin-left: 4px; }
.fx-chain { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
.fx-arrow { color: var(--ink-300); font-size: 13px; }
.fx-n { display: inline-flex; flex-direction: column; font-size: 12px; font-weight: 700; padding: 6px 11px; border-radius: 10px; background: var(--inset); color: var(--ink-700); line-height: 1.4; }
.fx-n em { font-style: normal; font-size: 10.5px; font-weight: 500; color: var(--ink-500); margin-top: 2px; }
.fx-n.fx-state { background: var(--white); border: 1px dashed var(--input-border); color: var(--ink-600); }
.fx-n.fx-act { background: var(--blue-50); color: var(--blue); }
.fx-n.fx-end { background: var(--green-bg); color: var(--green); }
.fx-n.fx-neg-n { background: var(--red-bg); color: var(--red); }
.fx-neg { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 11px; padding-top: 10px; border-top: 1px dashed var(--card-border); }
.fx-neg-tag { font-size: 10.5px; font-weight: 800; color: var(--ink-400); }
.fx-neg-note { font-size: 11.5px; color: var(--ink-500); line-height: 1.6; }

.fx-loops { margin-top: 12px; background: var(--orange-bg); border-radius: var(--radius-tile); padding: 12px 16px; }
.fx-loop { font-size: 12px; color: var(--ink-700); padding: 3px 0; }
.fx-loop b { color: var(--orange); }
.fx-loop span { color: var(--ink-400); font-size: 11px; margin-left: 6px; }

.fx-after { display: flex; gap: 10px; flex-wrap: wrap; }
.fx-after-card { flex: 1; min-width: 220px; border: 1px solid var(--card-border); border-radius: var(--radius-tile); padding: 13px 16px; font-size: 12.5px; color: var(--ink-700); }

.ia-warn { background: var(--red-bg); color: var(--red); border-radius: var(--radius-tile); padding: 12px 16px; font-size: 12px; margin-top: 16px; line-height: 1.7; }
</style>
</head>
<body data-screen="UW_IA_02">
<div class="ia-wrap">

  <h1 class="ia-h1">사용자웹 IA 지도</h1>
  <p class="ia-sub">
    하이라키와 flow는 축이 달라 한 장에 겹치면 둘 다 안 읽힌다. 그래서 층을 나눈다 —
    <b>L0 트리</b>는 소속만(화살표 없음), <b>플로우</b>는 흐름만(레벨 분기를 색으로).<br>
    화면 목록·모듈 표는 <a href="IA_사용자웹.html" style="color:var(--blue)">IA_사용자웹.html</a> 참조. 생성일 ${today}.
  </p>
${(missing.length || dup.length || unknown.length) ? `
  <div class="ia-warn">
    트리와 매트릭스가 어긋난다 —
    ${missing.length ? "트리에 빠진 화면 " + missing.length + "건: " + esc(missing.join(", ")) + "<br>" : ""}
    ${dup.length ? "트리에 중복된 화면 " + dup.length + "건: " + esc(dup.join(", ")) + "<br>" : ""}
    ${unknown.length ? "매트릭스에 없는 화면 " + unknown.length + "건: " + esc(unknown.join(", ")) : ""}
  </div>` : ""}

  <!-- ============ L0 사이트맵 트리 ============ -->
  <section class="ia-board">
    <div class="ia-board-title">L0 · 사이트맵 트리</div>
    <div class="ia-board-desc">
      화면 ${allFiles.length}개의 소속. 부모는 각 화면의 브레드크럼(상단바 “A › B”)을 기준으로 정했다 —
      링크 그래프로 자동 추론하면 알림 센터가 전 화면과 이어져 읽히지 않는다.<br>
      뱃지는 그 화면이 열리는 레벨. <span class="lv lv-all">전 레벨</span> 은 L1·L2·L3 모두, <span class="lv lv-none">—</span> 은 모듈이 등재되지 않아 판정이 없는 화면.
    </div>
    <div class="t-cols">
${treeHtml}
    </div>
  </section>

  <!-- ============ 콘텐츠 플로우 ============ -->
  <section class="ia-board">
    <div class="ia-board-title">플로우 · 콘텐츠</div>
    <div class="ia-board-desc">
      글 한 건이 만들어져 발행되기까지. 공통 골격을 먼저 그리고, <b>레벨에서 갈리는 지점만</b> 색으로 나눴다.
    </div>

    <div class="fx-stage">
      <div class="fx-stage-head"><span class="fx-stage-no">1</span>
        <span class="fx-stage-title">만들어지는 경로는 둘</span>
        <span class="fx-stage-desc">시작점이 다르면 검수 흐름도 달라진다</span></div>
      <div class="fx-row">${flowOrigins}</div>
      <div class="fx-feed">두 경로 모두 말투·길이·소재를 <b>${esc(BY_FILE[FLOW.feeds.screen] ? BY_FILE[FLOW.feeds.screen].title : FLOW.feeds.screen)}</b>에서 가져온다 — ${esc(FLOW.feeds.what)}</div>
    </div>

    <div class="fx-stage">
      <div class="fx-stage-head"><span class="fx-stage-no">2</span>
        <span class="fx-stage-title">승인권자는 누구인가</span>
        <span class="fx-stage-desc">레벨 + 검수 모드로 정해진다. 이후 흐름이 여기서 갈린다</span></div>
      <div style="border:1px solid var(--card-border);border-radius:var(--radius-card);padding:6px 18px">${reviewerHtml}</div>
    </div>

    <div class="fx-stage">
      <div class="fx-stage-head"><span class="fx-stage-no">3</span>
        <span class="fx-stage-title">검수 이후 — 레벨별 트랙</span>
        <span class="fx-stage-desc">승인이 곧 발행이 아니다. 채널 등록은 어느 레벨에서도 사람이 한다</span></div>
${tracksHtml}
      <div class="fx-loops">
${FLOW.loops.map(l => '        <div class="fx-loop">↩ <b>' + esc(l.from) + "</b> → " + esc(l.to) + "<span>" + esc(l.where) + "</span></div>").join("\n")}
      </div>
    </div>

    <div class="fx-stage">
      <div class="fx-stage-head"><span class="fx-stage-no">4</span>
        <span class="fx-stage-title">결과 확인</span>
        <span class="fx-stage-desc">발행 이후</span></div>
      <div class="fx-after">
${FLOW.after.map(a => '        <div class="fx-after-card">' + scRef(a.screen) + "<br>" + esc(a.what) + "</div>").join("\n")}
      </div>
    </div>
  </section>

</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log("생성: " + path.relative(ROOT, OUT));
console.log("  트리 " + seen.length + "노드 / 매트릭스 " + allFiles.length + "화면");
if (missing.length) console.log("  ⚠ 트리에 빠짐: " + missing.join(", "));
if (dup.length) console.log("  ⚠ 트리에 중복: " + dup.join(", "));
if (unknown.length) console.log("  ⚠ 매트릭스에 없음: " + unknown.join(", "));
if (!missing.length && !dup.length && !unknown.length) console.log("  ✓ 트리가 39화면을 정확히 한 번씩 덮는다");
