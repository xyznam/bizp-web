// 보드 → Figma 플러그인 입력 번들 (하이브리드: 디자인 영역만 이미지, 나머지는 네이티브 노드로 지시)
// 사용: node build_figma_bundle.mjs --manifest output/manifest.json [--screen 01] --out output/figma/bundle-01.json
// 이미지 바이트는 넣지 않는다 — 플러그인 UI에서 파일로 함께 전달한다(번들 용량 폭증 방지).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, relTo, writeJson, WORK_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
const policy = loadPolicy(args.policy);
const B = policy.board, C = policy.colors;
const manifestFile = path.resolve(args.manifest || path.join(WORK_ROOT, 'output', 'manifest.json'));
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

// 매니페스트가 가리키는 경로는 매니페스트 파일 위치 기준으로 푼다 (contracts/04-manifest.md)
const mf = (p) => relTo(manifestFile, p);

// 열 너비는 브라우저 실측값을 쓴다 (measure_tables.mjs). 코드로 추정하면 폰트 차이로 어긋난다.
const COLW_FILE = path.resolve(args.colwidths || path.join(WORK_ROOT, 'output', 'general', '_colwidths.json'));
const COLW = fs.existsSync(COLW_FILE) ? JSON.parse(fs.readFileSync(COLW_FILE, 'utf8')).boards : null;

const placementFile = path.resolve(args.placement || path.join(WORK_ROOT, 'output', 'boards', 'figma-placement.json'));
if (!fs.existsSync(placementFile)) {
  console.error(`placement 없음: ${placementFile}\nmerge_placements.mjs를 먼저 실행하거나 --placement로 경로를 지정하십시오.`);
  process.exit(2);
}
const placement = JSON.parse(fs.readFileSync(placementFile, 'utf8'));
const placeByName = Object.fromEntries(placement.boards.map((b) => [b.name, b]));

const IMG_X = 68, IMG_TOP_GAP = 24;

// build_board.mjs와 동일한 탐색·배치 규칙 (기하 계산이 어긋나면 HTML 보드와 Figma 결과가 달라진다)
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
function pillSlot(tree, bbox, side) {
  const PILL_W = 49, GAP = 4;
  const sibs = [];
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if (c.bbox !== bbox && Math.abs(c.bbox[1] - bbox[1]) < Math.max(bbox[3], 24)) sibs.push(c.bbox);
      walk(c);
    }
  };
  walk(tree);
  const clear = (x) => !sibs.some((s) => x + PILL_W + GAP > s[0] && x < s[0] + s[2] + GAP
    && bbox[1] < s[1] + s[3] && bbox[1] + bbox[3] > s[1]);
  const left = bbox[0] - PILL_W - GAP, right = bbox[0] + bbox[2] + GAP;
  if (side === 'right') return { x: right, dy: 0 };
  if (side === 'left') return { x: left, dy: 0 };
  if (clear(left)) return { x: left, dy: 0 };
  if (clear(right)) return { x: right, dy: 0 };
  return { x: bbox[0] + bbox[2] / 2 - PILL_W / 2, dy: -(bbox[3] / 2 + 18) };
}

// ── 디자인 영역 네이티브 렌더 트리 ────────────────────────────
// 플러그인은 계산하지 않는다. 좌표는 프레임 원점 기준으로, 색은 토큰을 푼 hex로 미리 바꿔 싣는다.
const RGB = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/;
function toHex(raw, tokens) {
  if (!raw) return null;
  let v = typeof raw === 'string' ? raw : (raw.ref ? tokens[raw.ref] : raw.value);
  if (!v) return null;
  v = String(v).trim();
  if (v.startsWith('#')) {
    const s = v.slice(1);
    const h = s.length === 3 ? [...s].map((c) => c + c).join('') : s.slice(0, 6);
    return { hex: '#' + h, a: s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1 };
  }
  const m = v.match(RGB);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a === 0) return null;
  const hex = '#' + [1, 2, 3].map((i) => Math.round(parseFloat(m[i])).toString(16).padStart(2, '0')).join('');
  return { hex, a };
}
const px = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

// 크롭 기준 프레임(contentRoot)을 찾는다. 사이드바·상단바는 크롭 밖이라 렌더 대상이 아니다.
// 셀렉터는 정책의 extraction.domContract.contentRoot에서 오고, 지원 형태는
// IR 트리가 담는 정보만큼이다: '#id' | '.a.b' | 'tag.a'
function findBySelector(node, selector) {
  const idSel = selector.match(/^#([\w-]+)$/);
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const tag = selector.match(/^([a-z][\w-]*)/i)?.[1]?.toLowerCase();
  const hit = (n) => (idSel
    ? n.id === idSel[1]
    : classes.length && classes.every((c) => (n.name || '').split(' ').includes(c)) && (!tag || n.tag === tag));
  if (hit(node)) return node;
  for (const c of node.children ?? []) { const r = findBySelector(c, selector); if (r) return r; }
  return null;
}

const CONTENT_ROOT = policy.extraction?.domContract?.contentRoot ?? '.main';

function renderTree(node, origin, tokens, depth = 0) {
  const [ox, oy] = origin;
  const [x, y, w, h] = node.bbox;
  if (w <= 0 || h <= 0) return null;               // 비가시 노드
  const out = {
    n: node.name || node.tag,
    x: +(x - ox).toFixed(1), y: +(y - oy).toFixed(1),
    w: +w.toFixed(1), h: +h.toFixed(1),
  };
  const fill = node.fills && toHex(node.fills[0], tokens);
  if (fill) out.bg = fill.hex, out.bgA = fill.a === 1 ? undefined : fill.a;
  // 테두리는 변별로. 네 변이 같으면 sc/sw 하나로, 다르면 bw(변별 두께)를 함께 싣는다.
  // 구분선(border-top만)을 네 변으로 그리면 사각형 상자가 되어 화면이 달라 보인다.
  if (node.strokes && node.strokes[0]) {
    const c = toHex(node.strokes[0], tokens);
    if (c) {
      out.sc = c.hex;
      out.sw = px(node.strokes[0].width) || 1;
      if (node.borderWidths) out.bw = node.borderWidths;   // [상, 우, 하, 좌]
      if (node.borderStyle) out.bs = node.borderStyle;     // dotted | dashed
    }
  }
  if (node.control) {
    out.ctl = { t: node.control.type };
    if (node.control.checked) out.ctl.c = 1;
    if (node.control.arrow) out.ctl.ar = node.control.arrow;
    if (node.control.padRight) out.ctl.pr = node.control.padRight;
    if (node.control.type === 'file') {
      const fi = policy.controls?.fileInput ?? {};
      out.ctl.b = fi.button ?? 'Choose File';
      out.ctl.e = fi.empty ?? 'No file chosen';
    }
  }
  if (node.radius) { const r = px(node.radius); if (r) out.r = r; }
  if (node.opacity != null) out.o = node.opacity;
  // 여러 줄에 걸친 인라인 요소 — 줄마다 실측 상자로 따로 낸다.
  // 합집합 상자에 글을 담으면 첫 줄이 형제(배지·링크) 위를 덮는다.
  const lineBoxes = node.lineBoxes;
  if (node.text && !lineBoxes) {
    const ts = node.textStyle || {};
    const col = toHex(ts.color, tokens);
    out.t = node.text;
    out.fs = px(ts.size) || 14;
    out.fw = parseInt(ts.weight, 10) || 400;
    out.tc = col ? col.hex : '#000000';
    const lh = px(ts.lineHeight);
    if (lh) out.lh = lh;
    if (ts.align) out.ta = ts.align;
    // 패딩은 텍스트 시작 위치를 좌우한다. 표 셀 정렬이 여기에 달려 있다
    if (node.padding) out.p = node.padding.map(px);
    // 원본에서 한 줄로 그려진 글은 줄바꿈을 금지한다 (extract_ir의 Range 실측값).
    // 폭에서 패딩을 뺀 값이 브라우저 content box와 0.x px만 어긋나도 줄이 넘어가
    // 버튼 라벨과 상태 배지가 세로로 쪼개진다.
    if (ts.lines === 1) out.nw = 1;
    // 실측한 글자 자리 — 정렬을 추론하지 않는다 (flex 가운데 정렬 버튼 등).
    // 한 줄 텍스트에만 쓴다. 여러 줄은 실측 폭이 가장 긴 줄에 딱 맞아 여유가 없어서,
    // 폰트가 1px만 넓어도 원본과 다른 지점에서 줄이 바뀐다(표 셀의 '서울 강/남').
    if (ts.box && ts.lines === 1) {
      out.tx = +(ts.box[0] - x).toFixed(1);
      out.ty = +(ts.box[1] - y).toFixed(1);
      out.tw = +ts.box[2].toFixed(1);
      out.th = +ts.box[3].toFixed(1);
    }
    // 문장 안의 볼드·강조 구간. 조각내지 않고 한 텍스트에 구간 스타일로 입힌다
    if (node.runs) {
      out.rn = node.runs.map((r) => {
        const rc = r.color && toHex(r.color, tokens);
        return { s: r.s, e: r.e, fw: r.weight ? parseInt(r.weight, 10) : undefined, tc: rc ? rc.hex : undefined };
      });
    }
  }
  const kids = [];
  // 혼합 노드의 직접 텍스트 + 여러 줄 인라인 요소의 줄별 조각
  // 실측 위치를 가진 별도 텍스트로 낸다 ('▲ 이번 달 +22 ·' 같은 지표 카드 부연)
  for (const run of [...(node.textRuns ?? []), ...(lineBoxes ?? [])]) {
    const ts = node.textStyle || {};
    const col = toHex(run.color ?? ts.color, tokens);   // 의사요소 조각은 자기 색을 가진다
    kids.push({
      n: 'text', x: +(run.bbox[0] - x).toFixed(1), y: +(run.bbox[1] - y).toFixed(1),
      w: +run.bbox[2].toFixed(1), h: +run.bbox[3].toFixed(1),
      t: run.text, fs: px(ts.size) || 14, fw: parseInt(ts.weight, 10) || 400,
      tc: col ? col.hex : '#000000', lh: px(ts.lineHeight) || undefined,
      nw: run.lines === 1 ? 1 : undefined,
    });
  }
  // inlineFlow 노드의 자식(strong·a·span)은 위 텍스트에 이미 흡수됐다.
  // 다시 그리면 같은 글자가 두 번 나온다. IR에는 남겨 둔다 — 콜아웃 셀렉터가 쓴다.
  if (!node.inlineFlow) {
    for (const c of node.children ?? []) {
      const r = renderTree(c, [x, y], tokens, depth + 1);   // 자식 좌표는 부모 기준 상대
      if (r) kids.push(r);
    }
  }
  if (kids.length) out.c = kids;
  // 아무 시각 정보도 자식도 없는 순수 래퍼는 싣지 않는다 (폼 위젯은 예외)
  if (!kids.length && !out.t && !out.bg && !out.sc && !out.ctl) return null;
  return out;
}

const targets = manifest.boards.filter((b) => !args.screen
  || b.label === args.screen || b.label.startsWith(args.screen));
if (!targets.length) { console.error(`대상 없음: ${args.screen}`); process.exit(2); }

// naming을 번들에 실어 플러그인이 화면군 이름을 알게 한다 (플러그인에 프로젝트명 하드코딩 금지)
const out = {
  generatedAt: new Date().toISOString(),
  gap: manifest.gap ?? B.gap,
  layout: { ...B },
  colors: C,
  naming: policy.naming ?? {},
  boards: [],
};
const warnings = [];

for (const b of targets) {
  const desc = JSON.parse(fs.readFileSync(mf(b.descriptions), 'utf8'));
  const place = placeByName[b.label];
  if (!place) { warnings.push(`${b.label}: placement 없음`); continue; }
  const headH = 34 + Math.max(34, b.cases.length * 22 + 12);

  const board = {
    name: b.label,
    screenId: b.screenId,
    chapter: b.chapter,
    cases: b.cases,
    application: b.application ?? B.application ?? '(application 미지정)',
    comment: b.comment ?? null,
    x: place.x, y: place.y, width: place.width, height: place.height,
    headerHeight: headH,
    kind: b.frame === 'general' ? 'general' : 'screen',
    design: null,
    callouts: [],
    descriptions: desc,
  };

  if (b.frame === 'general') {
    // General 보드는 이미지가 없다 — 표·텍스트를 그대로 실어 플러그인이 네이티브로 만든다
    board.general = JSON.parse(fs.readFileSync(mf(b.general), 'utf8'));
    // 실측 열 너비를 실어 보낸다 (플러그인은 계산하지 않는다)
    const m = COLW && COLW[b.label];
    if (!m) warnings.push(`${b.label}: 열 너비 실측값 없음 — measure_tables.mjs 실행 필요`);
    let ti = 0;
    for (const blk of board.general.blocks ?? []) {
      if (blk.type !== 'table') continue;
      const w = m && m[ti];
      if (w && w.length === blk.columns.length) blk.colWidths = w;
      else if (m) warnings.push(`${b.label} 표${ti + 1}: 실측 열 수 불일치 (${w ? w.length : '없음'} vs ${blk.columns.length})`);
      ti++;
    }
  } else {
    const ir = JSON.parse(fs.readFileSync(mf(b.ir), 'utf8'));
    let tree, shot, offset;
    if (!b.frame || b.frame === 'main') { tree = ir.tree; shot = ir.screenshot; offset = [0, 0]; }
    else if (b.frame === 'main-crop') { tree = ir.tree; shot = ir.mainCrop.screenshot; offset = ir.mainCrop.bbox; }
    else {
      const aux = ir.auxFrames.find((a) => a.selector === b.frame || a.auxId === b.frame);
      tree = aux?.tree; shot = aux?.screenshot; offset = aux?.tree.bbox;
    }
    if (!tree) { warnings.push(`${b.label}: 프레임 없음`); continue; }
    const frameBox = (!b.frame || b.frame === 'main') ? tree.bbox : offset;
    board.design = {
      image: path.basename(shot),          // 플러그인 UI가 파일명으로 매칭한다 (PNG 폴백용)
      x: IMG_X, y: headH + IMG_TOP_GAP,
      width: frameBox[2], height: frameBox[3],
    };

    // 네이티브 렌더 트리 — 디자인 영역만. 이 값이 있으면 플러그인이 PNG 대신 노드를 만든다
    const renderRoot = b.frame === 'main-crop' ? findBySelector(tree, CONTENT_ROOT) : tree;
    if (renderRoot) {
      const rt = renderTree(renderRoot, [frameBox[0], frameBox[1]], ir.tokens);
      if (rt) board.design.tree = rt;
      else warnings.push(`${b.label}: 렌더 트리 비어 있음`);
    } else {
      warnings.push(`${b.label}: 본문 컨테이너(${CONTENT_ROOT}) 없음 — PNG 폴백`);
    }

    for (const row of desc.rows) {
      if (!row.callout) continue;
      const bbox = row.callout.bbox ?? findBBox(tree, row.callout.selector);
      if (!bbox) { warnings.push(`${b.label} 콜아웃 미발견: ${row.no}:${row.callout.selector}`); continue; }
      const x = IMG_X + bbox[0] - offset[0] + (row.callout.dx ?? 0);
      const y = headH + IMG_TOP_GAP + bbox[1] - offset[1] + (row.callout.dy ?? 0);
      if (row.callout.type === 'region') {
        const bx = Math.max(2, x - 22);
        board.callouts.push({ kind: 'region', no: row.no, x: bx, y, height: bbox[3] });
      } else {
        const slot = pillSlot(tree, bbox, row.callout.side);
        board.callouts.push({
          kind: 'item', no: row.no,
          x: Math.max(2, Math.min(B.designWidth - 51, IMG_X + slot.x - offset[0] + (row.callout.dx ?? 0))),
          y: y + bbox[3] / 2 - 13 + slot.dy,
        });
      }
    }
  }
  out.boards.push(board);
}

const outFile = args.out || path.join(WORK_ROOT, 'output', 'figma', `bundle${args.screen ? '-' + args.screen : ''}.json`);
writeJson(outFile, out);
const imgs = out.boards.filter((b) => b.design).map((b) => b.design.image);
console.log(`번들 저장: ${outFile}`);
console.log(`보드 ${out.boards.length} (General ${out.boards.filter((b) => b.kind === 'general').length}) · 콜아웃 ${out.boards.reduce((s, b) => s + b.callouts.length, 0)}`);
console.log(`필요 이미지 ${imgs.length}개: ${imgs.slice(0, 6).join(', ')}${imgs.length > 6 ? ' …' : ''}`);
warnings.forEach((w) => console.warn('⚠', w));
