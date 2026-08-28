// 화면별 placement 조각 → 전역 figma-placement.json (계위 배치)
// 사용: node merge_placements.mjs --manifest output/manifest.json --parts output/placements --out output/boards/figma-placement.json
//
// 배치 규칙 (policy.layout)
//   · 화면 하나가 가로 띠(band) 하나를 차지한다. 다음 화면은 아래 띠로 내려간다
//   · 띠 안에서 메인 보드는 계위 깊이만큼 오른쪽으로 밀리고, 그 화면의 부속 보드가
//     메인 오른쪽으로 이어진다 (auxPerRow마다 줄바꿈)
//   · 계위는 매니페스트 cases의 Screen Path 뎁스에서 얻는다.
//     'A > B'는 LNB 화면(레벨 0), 'A > B > C'는 B의 하위 화면(레벨 1)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, writeJson, WORK_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
const policy = loadPolicy(args.policy);
const manifest = JSON.parse(fs.readFileSync(args.manifest || path.join(WORK_ROOT, 'output', 'manifest.json'), 'utf8'));
const partsDir = path.resolve(args.parts || path.join(WORK_ROOT, 'output', 'placements'));
const L = policy.layout ?? {};
const colGap = L.colGap ?? 160;
const rowGap = L.rowGap ?? 240;
const auxPerRow = L.auxPerRow ?? 4;
const gap = manifest.gap ?? policy.board.gap;

// 조각 로드 → label 색인
const byLabel = {};
for (const f of fs.readdirSync(partsDir).filter((x) => x.endsWith('.json'))) {
  const p = JSON.parse(fs.readFileSync(path.join(partsDir, f), 'utf8'));
  for (const b of p.boards) byLabel[b.name] = b;
}

// ── 계위 판정 ────────────────────────────────────────────────
// Screen Path의 마지막 마디를 떼어 낸 경로가 다른 화면의 경로와 같으면 그 화면이 부모다.
// 마디 개수로 세면 안 된다 — 'LNB그룹 > 화면'과 '로그인 (독립 진입) > 비밀번호 변경 요청'은
// 마디 수가 같지만 앞의 첫 마디는 그룹이고 뒤의 첫 마디는 화면(40)이다.
const segsOf = (mb) => (mb.cases?.[0] ?? '').replace(/^Case\s*\d+\.\s*/, '')
  .split('>').map((s) => s.trim()).filter(Boolean);
const pathOf = (mb) => segsOf(mb).join(' > ');
const isMain = (mb) => mb.frame === 'main' || mb.frame === 'main-crop';

// ── 가족 묶기 : 메인 보드 + 그 화면의 부속 보드 ────────────────
const index = new Map();
const roster = [];
for (const mb of manifest.boards) {
  if (isMain(mb) || mb.frame === 'general') {
    const fam = { main: mb, aux: [], level: 0, kids: [] };
    roster.push(fam);
    index.set(mb.label, fam);
  }
}

// 경로 → 가족. 같은 경로가 둘이면 먼저 나온 것을 정본으로 둔다
const byPath = new Map();
for (const fam of roster) {
  if (fam.main.frame === 'general') continue;
  const p = pathOf(fam.main);
  if (p && !byPath.has(p)) byPath.set(p, fam);
}
const roots = [];
for (const fam of roster) {
  const segs = fam.main.frame === 'general' ? [] : segsOf(fam.main);
  const parent = segs.length > 1 ? byPath.get(segs.slice(0, -1).join(' > ')) : null;
  if (parent && parent !== fam) { parent.kids.push(fam); fam.parent = parent; }
  else roots.push(fam);
}
// 그룹(LNB)별로 모아 둔다. 그룹마다 Figma 페이지를 나누므로 한 그룹의 가족이
// 캔버스에서 연속되지 않으면 페이지에 빈 세로 공백이 생긴다.
// 판정은 build_figma_groups.mjs와 같아야 한다.
const groupOf = (mb) => {
  if (mb.frame === 'general') return 'General';
  const c = mb.cases?.[0] ?? '';
  if (/독립 진입|상단바/.test(c)) return '계정-인증';
  return (c.match(/Case\s*1\.\s*([^>]+?)\s*>/)?.[1] ?? '기타').trim().replace(/\//g, '-');
};
const order = [];
const seenGroup = new Map();
for (const r of roots) {
  const g = groupOf(r.main);
  if (!seenGroup.has(g)) { seenGroup.set(g, []); order.push(g); }
  seenGroup.get(g).push(r);
}

// 부모 바로 아래에 자식이 오도록 깊이 우선으로 펼친다
const families = [];
const emit = (fam, level) => {
  fam.level = level;
  families.push(fam);
  for (const k of fam.kids) emit(k, level + 1);
};
for (const g of order) for (const r of seenGroup.get(g)) emit(r, 0);
for (const mb of manifest.boards) {
  if (isMain(mb) || mb.frame === 'general') continue;
  const parent = mb.label.split('__')[0];
  const fam = index.get(parent);
  if (fam) fam.aux.push(mb);
  else {
    // 부모 없는 부속(공통 팝업 등)은 스스로 한 가족이 된다
    const own = { main: mb, aux: [], level: 0 };
    families.push(own);
    index.set(mb.label, own);
  }
}

// ── 배치 ────────────────────────────────────────────────────
const missing = [];
const boards = [];
let y = 0;
let maxX = 0;

const take = (mb) => {
  const b = byLabel[mb.label];
  if (!b) { missing.push(mb.label); return null; }
  if (!fs.existsSync(path.join(WORK_ROOT, b.file))) { missing.push(`${mb.label} (PNG 없음)`); return null; }
  return b;
};
const put = (b, x, yy) => {
  boards.push({ index: boards.length, name: b.name, file: b.file, x, y: yy, width: b.width, height: b.height });
  maxX = Math.max(maxX, x + b.width);
};

for (const fam of families) {
  const m = take(fam.main);
  if (!m) continue;
  const x0 = fam.level * (policy.board.width + colGap);
  put(m, x0, y);

  // 부속은 메인 오른쪽으로. auxPerRow마다 줄을 바꾸되 첫 부속 열에 맞춰 정렬한다
  const auxX0 = x0 + m.width + colGap;
  let rowTop = y;
  let rowHeight = 0;
  let col = 0;
  let bandBottom = y + m.height;
  for (const ab of fam.aux) {
    const a = take(ab);
    if (!a) continue;
    if (col === auxPerRow) { rowTop += rowHeight + gap; rowHeight = 0; col = 0; }
    put(a, auxX0 + col * (policy.board.width + colGap), rowTop);
    rowHeight = Math.max(rowHeight, a.height);
    bandBottom = Math.max(bandBottom, rowTop + a.height);
    col++;
  }
  y = bandBottom + rowGap;
}

const out = args.out || path.join(WORK_ROOT, 'output', 'boards', 'figma-placement.json');
writeJson(out, {
  generatedAt: new Date().toISOString(), gap,
  layout: { colGap, rowGap, auxPerRow, boardWidth: policy.board.width },
  capture: { count: boards.length, expectedWidth: policy.board.width },
  boards,
});
const levels = families.reduce((acc, f) => (acc[f.level] = (acc[f.level] || 0) + 1, acc), {});
console.log(`전역 placement: ${out} — 보드 ${boards.length}/${manifest.boards.length}`);
console.log(`가족 ${families.length} (레벨별 ${JSON.stringify(levels)}) · 캔버스 ${maxX}×${Math.max(0, y - rowGap)}px`);
if (missing.length) { console.error('누락:', missing.join(', ')); process.exit(1); }
