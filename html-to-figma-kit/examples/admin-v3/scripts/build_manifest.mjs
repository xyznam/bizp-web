// IR 전량 → manifest.json 자동 조립 (챕터=페이지 타이틀, 경로=사이드바 활성 항목, 가안 Screen ID)
// 사용: node build_manifest.mjs --out output/manifest.json [--date 2026.7.27]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, SKILL_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
const policy = loadPolicy(args.policy);
const irDir = path.join(SKILL_ROOT, 'output', 'ir');
const date = args.date || '2026.7.27';
const pad3 = (n) => String(n).padStart(3, '0');
const pad2 = (n) => String(n).padStart(2, '0');

// IR 트리 탐색 헬퍼
const findNode = (n, pred) => {
  if (!n) return null;
  if (pred(n)) return n;
  for (const c of n.children ?? []) { const r = findNode(c, pred); if (r) return r; }
  return null;
};
const hasClass = (n, cls) => (n.name || '').split(' ').includes(cls);
const textOf = (n) => n?.text ?? findNode(n, (x) => !!x.text)?.text ?? null;

const files = fs.readdirSync(irDir).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const boards = [];
const warnings = [];

for (const f of files) {
  const ir = JSON.parse(fs.readFileSync(path.join(irDir, f), 'utf8'));
  const no = ir.screen;
  const label = path.basename(ir.sourceFile, '.html');
  const screenName = label.replace(/^\d+_/, '');

  // 챕터: HTML <title> 앞부분이 정본 (상세 화면의 .page-title은 데모 데이터를 물고 있음) → 폴백 .page-title → 파일명
  let docTitle = null;
  try {
    const html = fs.readFileSync(path.join(SKILL_ROOT, '..', 'prototype', 'admin-v3-static', ir.sourceFile), 'utf8');
    docTitle = html.match(/<title>([^<|]+)/)?.[1].trim() || null;
  } catch { /* 소스 없으면 폴백 */ }
  const pageTitle = docTitle ?? textOf(findNode(ir.tree, (n) => hasClass(n, 'page-title'))) ?? screenName;
  // 경로: 사이드바 활성 항목 + 직전 그룹 라벨
  let group = null, active = null;
  const sidebar = findNode(ir.tree, (n) => hasClass(n, 'sidebar'));
  if (sidebar) {
    let lastSection = null;
    const walkSb = (n) => {
      if (hasClass(n, 'sb-section')) lastSection = textOf(n);
      if (hasClass(n, 'sb-item') && hasClass(n, 'active')) { group = lastSection; active = textOf(findNode(n, (x) => !hasClass(x, 'si') && !!x.text)) ?? textOf(n); }
      (n.children ?? []).forEach(walkSb);
    };
    walkSb(sidebar);
  }
  // 컨텍스트 진입 화면의 부모 매핑 (38 근거: 50/53←01, 48/52←06, 51←02, 39←14, 41/42/44←40, 46←45)
  const CONTEXT_PARENT = { 39: '14', 41: '40', 42: '40', 44: '40', 46: '45', 48: '06', 50: '01', 51: '02', 52: '06', 53: '01' };
  let caseMain;
  if (active) {
    caseMain = `Case 1. ${group ? group + ' > ' : ''}${active}`;
  } else if (parseInt(no) === 40) {
    caseMain = 'Case 1. 로그인 (독립 진입)';
  } else if (parseInt(no) === 45) {
    caseMain = 'Case 1. 상단바 사용자 메뉴 > 내 정보 관리';
  } else if (CONTEXT_PARENT[parseInt(no)]) {
    const parent = boards.find((b) => b._no === CONTEXT_PARENT[parseInt(no)] && !b.label.includes('__'));
    caseMain = parent
      ? `${parent.cases[0]} > ${pageTitle}`
      : `Case 1. ${pageTitle} (컨텍스트 진입 — 부모 미해석)`;
    if (!parent) warnings.push(`${label}: 부모 화면 ${CONTEXT_PARENT[parseInt(no)]} 미발견`);
  } else {
    caseMain = `Case 1. ${pageTitle} (독립 진입)`;
    warnings.push(`${label}: 진입 경로 매핑 없음 — 독립 진입 처리`);
  }

  boards.push({
    label,
    screenId: `BZP-AD-PG-${pad3(parseInt(no))}`,
    chapter: `${no}. ${pageTitle}`,
    _no: no, _pageTitle: pageTitle,
    cases: [caseMain],
    application: 'Web Admin',
    sourceFile: ir.sourceFile,
    frame: ir.mainCrop ? 'main-crop' : 'main',
    ir: `output/ir/${no}.json`,
    descriptions: `output/descriptions/${no}.json`,
    comment: `*Comment ${date}.\n-admin-v3-static 스냅샷 기준 자동 생성 + 수기 보완. 디스크립션 근거 : planning 37/38/39, IA(launch v3), 화면 정의 원문`,
  });

  // 부속 보드 (추출 순서 = 채번 순서, 제외 패턴 필터)
  // manifestOnlyPatterns는 IR에는 남아 있으나 화면별 보드를 만들지 않는 프레임이다
  // (공통 팝업 — 보드는 별도로 1개만 두고 화면은 초록 참조로 처리한다)
  const exPatterns = [
    ...(policy.extraction.auxExclude?.patterns ?? []),
    ...(policy.extraction.auxExclude?.manifestOnlyPatterns ?? []),
  ].map((p) => new RegExp(p));
  const auxBoards = ir.auxFrames.filter((a) => !exPatterns.some((re) => re.test(a.auxId)));
  auxBoards.forEach((aux, i) => {
    // 모달 타이틀: 부제/힌트(—, ※ 접두) 제외한 첫 텍스트
    const texts = [];
    const collect = (n) => { if (n?.text) texts.push(n.text); (n?.children ?? []).forEach(collect); };
    collect(findNode(aux.tree, (n) => hasClass(n, 'modal-title') || n.id === 'piiTitle'));
    const title = texts.find((t) => !/^[—–\-※(]/.test(t)) ?? aux.auxId;
    // 실체 구분: .modal.drawer는 드로어, 그 외는 팝업
    const kind = (aux.tree.name || '').split(' ').includes('drawer') ? 'Drawer' : 'Popup';
    boards.push({
      label: `${label}__${aux.auxId}`,
      screenId: `BZP-AD-PP-${pad3(parseInt(no))}-${pad2(i + 1)}`,
      chapter: `${no}. ${pageTitle}`,
      cases: [`${caseMain} > ${title} (${kind})`],
      application: 'Web Admin',
      sourceFile: ir.sourceFile,
      frame: aux.auxId,
      ir: `output/ir/${no}.json`,
      descriptions: `output/descriptions/${no}_${aux.auxId}.json`,
      comment: `*Comment ${date}.\n-${no} 부속 보드(자동 생성 + 수기 보완). 근거 : 모달 화면 정의 원문, planning 37/38/39`,
    });
  });
}

// 같은 모달 제목이 여러 부속에 쓰이면 경로가 겹치므로 auxId를 병기해 구분한다
const pathCount = {};
for (const b of boards) pathCount[b.cases[0]] = (pathCount[b.cases[0]] || 0) + 1;
for (const b of boards) {
  if (pathCount[b.cases[0]] > 1 && b.label.includes('__')) {
    b.cases[0] = b.cases[0].replace(/\s\((Popup|Drawer)\)$/, ` [${b.label.split('__')[1]}] ($1)`);
  }
}

for (const b of boards) { delete b._no; delete b._pageTitle; } // 내부 필드 제거

// General 공통 정의 보드 — 카테고리 선두에 배치 (정의가 화면보다 앞선다)
const genDir = path.join(SKILL_ROOT, 'output', 'general');
const genBoards = [];
if (fs.existsSync(genDir)) {
  const files = fs.readdirSync(genDir).filter((f) => /^G-\d+\.json$/.test(f)).sort();
  for (const f of files) {
    const g = JSON.parse(fs.readFileSync(path.join(genDir, f), 'utf8'));
    const seq = f.match(/G-(\d+)/)[1];
    genBoards.push({
      // 라벨은 파일명·레이어명으로 쓰이므로 경로 구분자가 되는 문자를 제거한다
      label: `G-${seq}_${g.title.replace(/\s+/g, '').replace(/[/\\:*?"<>|]/g, '-')}`,
      screenId: `BZP-AD-GN-${pad3(parseInt(seq))}`,
      chapter: `General — ${g.group}`,
      cases: [`Case 1. General > ${g.group} > ${g.title}`],
      application: 'Web Admin',
      frame: 'general',
      general: `output/general/${f}`,
      descriptions: `output/descriptions/G-${seq}.json`,
      comment: `*Comment ${date}.\n-General 공통 정의(자동 생성 + 수기 보완). 화면 하단 정책 블록을 축별로 단일화. 개별 화면 보드는 이 정의를 참조만 한다`,
    });
  }
}
boards.unshift(...genBoards);
const manifest = {
  title: 'BizPlanet Admin v3 — UID 보드 (47화면 전량)',
  viewportWidth: policy.board.width,
  gap: policy.board.gap,
  sourceDir: '../prototype/admin-v3-static',
  policyDir: '../planning',
  boards,
};
const out = args.out || path.join(SKILL_ROOT, 'output', 'manifest.json');
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`매니페스트 저장: ${out}`);
console.log(`화면 ${files.length} · 보드 ${boards.length} (부속 ${boards.length - files.length})`);
warnings.forEach((w) => console.warn('⚠', w));
