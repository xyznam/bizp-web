// IR + 디스크립션 + 매니페스트 → 1920px UID 보드 HTML
// 사용: node build_board.mjs --manifest output/manifest.json --screen 01_회원현황 --out output/boards-html/01.html
// 규격 정본: spec/board-template.md (치수·색은 board-policy.json에서 로드)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, relTo, WORK_ROOT } from './lib.mjs';

// 매니페스트가 가리키는 경로는 매니페스트 파일 위치 기준으로 푼다 (contracts/04-manifest.md)
const mf = (p) => relTo(args.manifest, p);

const args = parseArgs(process.argv);
if (!args.manifest || !args.out) { console.error('필수: --manifest --out'); process.exit(2); }
const policy = loadPolicy(args.policy);
const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
const B = policy.board, C = policy.colors;

const boards = manifest.boards.filter((b) => !args.screen || b.label === args.screen || b.label.startsWith(args.screen));
if (!boards.length) { console.error(`화면 없음: ${args.screen}`); process.exit(2); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (p) => path.relative(path.dirname(path.resolve(args.out)), path.resolve(WORK_ROOT, p));

// IR 트리에서 단순 셀렉터(#id | .a.b | tag.a)로 노드 bbox 탐색
function findBBox(tree, selector) {
  const idSel = selector.match(/^#([\w-]+)$/);
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const tag = selector.match(/^([a-z][\w-]*)/i)?.[1]?.toLowerCase();
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    const ncls = (n.name || '').split(' ');
    if (idSel ? n.id === idSel[1]
      : (classes.length && classes.every((c) => ncls.includes(c)) && (!tag || n.tag === tag))) { hit = n; return; }
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return hit?.bbox ?? null;
}

// 대상 요소를 가리지 않는 알약 칩 위치 결정: 좌측 여백 → 우측 여백 → 위쪽 순
// 이웃 요소(형제)의 bbox와 겹치면 다음 후보로 넘어간다.
function pillSlot(tree, bbox, side) {
  const PILL_W = 49, GAP = 4;
  const sibs = [];
  const walk = (n, parent) => {
    for (const c of n.children ?? []) {
      // 같은 부모를 공유하고 세로로 겹치는 요소만 이웃으로 본다
      if (c.bbox !== bbox && Math.abs(c.bbox[1] - bbox[1]) < Math.max(bbox[3], 24)) sibs.push(c.bbox);
      walk(c, n);
    }
  };
  walk(tree, null);
  const clear = (x) => !sibs.some((s) => x + PILL_W + GAP > s[0] && x < s[0] + s[2] + GAP
    && bbox[1] < s[1] + s[3] && bbox[1] + bbox[3] > s[1]);
  const left = bbox[0] - PILL_W - GAP;
  const right = bbox[0] + bbox[2] + GAP;
  if (side === 'right') return { x: right, dy: 0 };
  if (side === 'left') return { x: left, dy: 0 };
  if (clear(left)) return { x: left, dy: 0 };
  if (clear(right)) return { x: right, dy: 0 };
  return { x: bbox[0] + bbox[2] / 2 - PILL_W / 2, dy: -(bbox[3] / 2 + 18) }; // 위쪽 회피
}

const IMG_X = 68, IMG_TOP_GAP = 24;
const FLAG_LABEL = { confirm: '추가 확인 필요한 사항', reference: '페이지 이동 또는 참고 문서 지시', common: '기타 공통 정의' };
const FLAG_COLOR = { confirm: C['flag.confirm'], reference: C['flag.reference'], common: C['flag.common'] };

// General 보드: 디자인 영역에 이미지 대신 공통 표·텍스트 블록을 직접 렌더
function renderGeneralBody(g) {
  return (g.blocks ?? []).map((blk) => {
    if (blk.type === 'table') {
      // 열 너비는 브라우저의 자동 배분에 맡긴다. 폭을 코드로 추정하면 폰트·자간 차이로 어긋나
      // 'MANAGER'가 두 줄로 접히는 일이 생긴다. 실측값은 measure_tables.mjs가 뽑아 Figma로 넘긴다.
      return `<section class="gsec">
${blk.caption ? `<h3>${esc(blk.caption)}</h3>` : ''}
${blk.note ? `<p class="gnote">${esc(blk.note)}</p>` : ''}
<table class="gtbl"><thead><tr>${blk.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${blk.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
</section>`;
    }
    return `<section class="gsec">
${blk.title ? `<h3>${esc(blk.title)}</h3>` : ''}
${(blk.paragraphs ?? []).map((p) => `<p class="gp">${esc(p)}</p>`).join('')}
${(blk.bullets ?? []).length ? `<ul class="gul">${blk.bullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
</section>`;
  }).join('');
}

function renderBoard(b) {
  const desc = JSON.parse(fs.readFileSync(mf(b.descriptions), 'utf8'));
  if (b.frame === 'general') return renderGeneral(b, desc);
  const ir = JSON.parse(fs.readFileSync(mf(b.ir), 'utf8'));
  // frame: main(전체) | main-crop(contentRoot 콘텐츠만) | <부속 셀렉터/auxId>
  let tree, shot, auxOffset;
  if (!b.frame || b.frame === 'main') {
    tree = ir.tree; shot = ir.screenshot; auxOffset = [0, 0];
  } else if (b.frame === 'main-crop') {
    if (!ir.mainCrop) throw new Error(`${b.label}: IR에 mainCrop 없음 (extract_ir 재실행 필요)`);
    tree = ir.tree; shot = ir.mainCrop.screenshot; auxOffset = ir.mainCrop.bbox;
  } else {
    const aux = ir.auxFrames.find((a) => a.selector === b.frame || a.auxId === b.frame);
    tree = aux?.tree; shot = aux?.screenshot; auxOffset = aux?.tree.bbox;
  }
  if (!tree) throw new Error(`${b.label}: 프레임 없음 (${b.frame ?? 'main'})`);

  const caseLines = b.cases.map((c) => `<div>${esc(c)}</div>`).join('');
  const headH = 34 + Math.max(34, b.cases.length * 22 + 12);
  const imgY = headH + IMG_TOP_GAP;
  const frameBox = (!b.frame || b.frame === 'main') ? tree.bbox : auxOffset;
  const imgW = frameBox[2], imgH = frameBox[3];

  // 콜아웃 (디자인 영역 오버레이 — .design 좌표계)
  let callouts = '';
  const missing = [];
  for (const row of desc.rows) {
    if (!row.callout) continue;
    const bbox = row.callout.bbox ?? findBBox(tree, row.callout.selector);
    if (!bbox) { missing.push(`${row.no}:${row.callout.selector}`); continue; }
    const x = IMG_X + bbox[0] - auxOffset[0] + (row.callout.dx ?? 0);
    const y = IMG_TOP_GAP + bbox[1] - auxOffset[1] + (row.callout.dy ?? 0);
    if (row.callout.type === 'region') {
      // 브래킷 수직선을 대상 요소 왼쪽 22px에 앵커 (LNB 포함 여부와 무관하게 실제 위치 표기)
      const bx = Math.max(2, x - 22);
      callouts += `<div class="rgn" style="left:${bx}px;top:${y}px;height:${bbox[3]}px"></div>
<div class="chip" style="left:${bx - 13}px;top:${y + 12}px">${esc(row.no)}</div>`;
    } else {
      // 대상을 가리지 않는 슬롯 자동 선택 (side 지정 시 강제, dx·dy로 미세 조정)
      const slot = pillSlot(tree, bbox, row.callout.side);
      const px = Math.max(2, Math.min(B.designWidth - 51, IMG_X + slot.x - auxOffset[0] + (row.callout.dx ?? 0)));
      const py = y + bbox[3] / 2 - 13 + slot.dy;
      callouts += `<div class="pill" style="left:${px}px;top:${py}px">${esc(row.no)}</div>`;
    }
  }
  if (missing.length) console.warn(`⚠ ${b.label} 콜아웃 대상 미발견: ${missing.join(', ')}`);

  return boardShell(b, desc, `
      <img src="${esc(rel(shot))}" style="left:${IMG_X}px;top:${IMG_TOP_GAP}px;width:${imgW}px" alt="${esc(b.label)}">
      <div class="overlay">${callouts}</div>`, Math.max(b.minHeight ?? B.minHeight, imgY + imgH + 60), headH);
}

// General 보드 — 이미지 대신 공통 표·텍스트를 디자인 영역에 직접 렌더
function renderGeneral(b, desc) {
  const g = JSON.parse(fs.readFileSync(mf(b.general), 'utf8'));
  const headH = 34 + Math.max(34, b.cases.length * 22 + 12);
  // 표 밀도로 높이를 추정한다 (캡처 시 실측으로 재조정되므로 하한만 잡음)
  const est = (g.blocks ?? []).reduce((s, blk) => s + (blk.type === 'table'
    ? 70 + blk.rows.length * 34
    : 50 + (blk.paragraphs ?? []).length * 26 + (blk.bullets ?? []).length * 24), 0);
  const boardH = Math.max(b.minHeight ?? B.minHeight, headH + est + 80);
  return boardShell(b, desc, `
      <div class="gbody">${renderGeneralBody(g)}</div>`, boardH, headH);
}

// 디스크립션 표 + 보드 골격 (일반 보드·General 보드 공용)
function boardShell(b, desc, designInner, boardH, headH) {
  const caseLines = b.cases.map((c) => `<div>${esc(c)}</div>`).join('');
  const flagRows = (desc.flags ?? []).map((f) => `
<tr class="flag"><td class="num" style="background:${FLAG_COLOR[f.kind]}">※</td>
<td class="body" style="color:${FLAG_COLOR[f.kind]}">${esc(f.text)}</td></tr>`).join('');
  const reqRow = (desc.requirements ?? []).length ? `
<tr class="req"><td class="num">요구<br>사항</td><td class="body">
${desc.requirements.map((q) => `<div class="rq">${esc(q.id)} : ${esc(q.text)}</div>`).join('')}
</td></tr>` : '';
  const numRows = desc.rows.map((r) => `
<tr${r.nocallout ? ' data-nocallout="1"' : ''}><td class="num">${esc(r.no)}</td><td class="body">
<div class="ttl">${esc(r.title)}</div>
${(r.bullets ?? []).map((bl) => `<div class="bl i${bl.indent ?? 0}"${bl.color ? ` style="color:${bl.color === 'red' ? C['flag.confirm'] : C['flag.reference']}"` : ''}>${esc(bl.text)}</div>`).join('')}
</td></tr>`).join('');
  const comment = b.comment ? `<div class="cmt">${esc(b.comment)}</div>` : '';

  return `
<article class="uid-board${b.frame === 'general' ? ' general' : ''}" data-label="${esc(b.label)}" style="min-height:${boardH}px">
  <div class="left">
    <header>
      <div class="hrow" style="height:34px"><div class="hcell" style="background:${C['header.chapter']}">Chapter</div>
        <div class="htxt"><strong>${esc(b.chapter)}</strong></div>
        <div class="appchip">${esc(b.application ?? B.application ?? '(application 미지정)')}</div></div>
      <div class="hrow" style="min-height:34px"><div class="hcell" style="background:${C['header.path']}">Screen Path</div>
        <div class="htxt cases"><strong>${caseLines}</strong></div>
        <div class="sid"><strong>Screen ID</strong><span>${esc(b.screenId)}</span></div></div>
    </header>
    <div class="design"${b.frame === 'general' ? '' : ` style="height:${boardH - headH}px"`}>${designInner}
    </div>
  </div>
  <div class="right">
    <table><thead><tr><th class="num">Num</th><th>Description</th></tr></thead>
    <tbody>${flagRows}${reqRow}${numRows}</tbody></table>
    ${comment}
  </div>
</article>`;
}

const css = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#888;font-family:${B.fontFamily};font-size:14px;color:#000}
.uid-board{width:${B.width}px;background:#fff;display:grid;grid-template-columns:${B.designWidth}px ${B.descriptionWidth}px;margin:0 auto ${B.gap}px;position:relative;overflow:hidden}
.left{border-right:1px solid ${C['table.line']}}
header{border-bottom:1px solid #000}
.hrow{display:flex;align-items:stretch;border-bottom:1px solid #000}
.hrow:last-child{border-bottom:none}
.hcell{width:94px;flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;border-right:1px solid #000}
.htxt{flex:1;display:flex;align-items:center;padding:6px 0 6px 12px;font-weight:700}
.htxt.cases{flex-direction:column;align-items:flex-start;justify-content:center;line-height:22px}
.appchip{align-self:center;margin-right:27px;width:125px;height:20px;background:${C['header.app']};color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:2px}
.sid{display:flex;align-items:center;gap:24px;margin-right:120px}
.design{position:relative;background:#fff}
.design img{position:absolute;display:block}
.overlay{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.rgn{position:absolute;width:20px;border:2px solid ${C['callout.region']};border-right:none}
.chip{position:absolute;width:26px;height:26px;border-radius:50%;background:${C['callout.region']};color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
.pill{position:absolute;width:49px;height:26px;border-radius:13px;background:${C['callout.item']};color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
.right table{width:100%;border-collapse:collapse}
.right th{background:#000;color:#fff;height:30px;font-weight:700}
.right th.num,.right td.num{width:49px;text-align:center;border-right:1px solid ${C['table.line']}}
.right td{border-bottom:1px solid ${C['table.line']};vertical-align:middle}
.right tr.flag td{height:34px}
.right tr.flag td.num{color:#fff;font-weight:700}
.right tr.flag td.body{background:${C['table.stripe']};padding:0 8px;font-weight:500}
.right td.num{font-weight:700}
.right td.body{padding:10px 8px;overflow-wrap:anywhere}
.ttl{font-weight:700;margin-bottom:2px}
.bl{padding-left:14px;position:relative;line-height:1.45}
.bl::before{content:'•';position:absolute;left:2px}
.bl.i1{padding-left:30px}
.bl.i1::before{left:18px}
.bl.i2{padding-left:46px}
.bl.i2::before{left:34px}
.cmt{background:#000;color:#fff;padding:10px 12px;white-space:pre-line}
/* General 보드 — 공통 표·텍스트 */
/* 흐름 배치 — 콘텐츠가 디자인 영역 높이를 결정한다(절대 배치 시 초과분이 잘림) */
.gbody{padding:${IMG_TOP_GAP}px ${IMG_X}px 40px;width:${B.designWidth}px;display:flex;flex-direction:column;gap:22px}
.uid-board.general .design{height:auto;min-height:0}
.uid-board.general{align-items:start}
.gsec h3{font-size:15px;font-weight:700;color:#1A1A2E;margin-bottom:8px;letter-spacing:-.2px}
.gnote{font-size:12px;color:#4A5568;margin-bottom:8px;line-height:1.5}
.gp{font-size:13px;color:#1A1A2E;line-height:1.65;margin-bottom:6px}
.gul{margin:4px 0 0 18px}
.gul li{font-size:13px;color:#1A1A2E;line-height:1.6;margin-bottom:3px}
.gtbl{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:auto}
.gtbl th{background:#F1F3F5;border:1px solid ${C['table.line']};padding:7px 9px;text-align:left;font-weight:700;color:#1A1A2E;white-space:nowrap}
.gtbl td{border:1px solid #D5D8DC;padding:7px 9px;color:#1A1A2E;vertical-align:top;line-height:1.5;word-break:keep-all;overflow-wrap:break-word}
.gtbl tbody tr:nth-child(even) td{background:#FAFBFC}
.right tr.req td.num{font-size:12px;line-height:1.25}
.rq{line-height:1.45}
`;

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(manifest.title)}</title><style>${css}</style></head>
<body>
${boards.map(renderBoard).join('\n')}
<script>
// ?board=<label> 단일 보드 확인용
const q = new URLSearchParams(location.search).get('board');
if (q) document.querySelectorAll('.uid-board').forEach((b) => { if (b.dataset.label !== q) b.remove(); });
</script>
</body></html>`;

fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), html);
console.log(`보드 HTML 저장: ${args.out} (${boards.length}개 보드: ${boards.map((b) => b.label).join(', ')})`);
