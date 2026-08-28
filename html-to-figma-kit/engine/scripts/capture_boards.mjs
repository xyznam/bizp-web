// 보드 HTML → 보드별 PNG + figma-placement.json + 검증 리포트
//
// 리포트 경로는 반드시 --report 로 받는다. (원본 v3 스크립트는 리포트 경로가 고정이라
// --output 만 바꿔도 남의 리포트를 덮어썼다. 2026-08-06 실측으로 확인된 결함)
//
// 사용: node capture_boards.mjs --html <보드>.html --output output/boards
//                               --report output/reports [--gap 120] [--expected-width 1920]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, launchPage, writeJson, WORK_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
if (!args.html) { console.error('필수: --html'); process.exit(2); }
const policy = loadPolicy(args.policy);
const gap = Number(args.gap ?? policy.board.gap);
const outDir = path.resolve(args.output ?? path.join(WORK_ROOT, 'output', 'boards'));
fs.mkdirSync(outDir, { recursive: true });

const { browser, page, consoleErrors, requestFailures } = await launchPage(policy, { viewport: { width: 2000, height: 1200 } });
await page.goto('file://' + path.resolve(args.html), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// 보드별 측정 + 정합 검사 (콜아웃 번호 ↔ Num 열)
const inspect = await page.evaluate(() => {
  const boards = [...document.querySelectorAll('.uid-board')].map((b) => {
    const r = b.getBoundingClientRect();
    const calloutNos = [...b.querySelectorAll('.chip,.pill')].map((c) => c.textContent.trim());
    // nocallout 선언 행(숨은 상태 서술)은 콜아웃 정합 대상에서 제외
    const rowNos = [...b.querySelectorAll('.right tbody tr:not([data-nocallout]):not(.req) td.num')].map((c) => c.textContent.trim()).filter((t) => t !== '※');
    const emptyRows = [...b.querySelectorAll('.right tbody tr')].filter((tr) => !tr.textContent.trim()).length;
    const emptyTitles = [...b.querySelectorAll('.right .ttl')].filter((t) => !t.textContent.trim()).length;
    // 디스크립션 표가 보드 높이를 넘는지(세로 오버플로)
    const table = b.querySelector('.right table');
    const cmt = b.querySelector('.cmt');
    const descBottom = (cmt ?? table).getBoundingClientRect().bottom - r.top;
    // 디자인 영역 콘텐츠가 보드 밖으로 넘쳐 잘리는지 (General 표·텍스트 블록 절단 검출)
    const design = b.querySelector('.design');
    const last = design?.lastElementChild?.lastElementChild ?? design?.lastElementChild;
    const designBottom = last ? last.getBoundingClientRect().bottom - r.top : 0;
    return {
      label: b.dataset.label, width: Math.round(r.width), height: Math.round(r.height),
      calloutNos, rowNos, emptyRows, emptyTitles,
      descOverflow: Math.max(0, Math.round(descBottom - r.height)),
      designOverflow: Math.max(0, Math.round(designBottom - r.height)),
      horizOverflow: Math.max(0, Math.round(b.scrollWidth - r.width)),
    };
  });
  const dupLabels = boards.map((b) => b.label).filter((l, i, a) => a.indexOf(l) !== i);
  return { boards, dupLabels };
});

// 캡처 (보드 요소 단위)
const placement = [];
let y = 0;
for (let i = 0; i < inspect.boards.length; i++) {
  const b = inspect.boards[i];
  // 라벨에 경로 구분자가 섞여도 하위 폴더가 생기지 않도록 파일명을 안전화한다
  const file = path.join(outDir, `${b.label.replace(/[/\\]/g, '-')}.png`);
  await page.locator(`.uid-board[data-label="${b.label}"]`).screenshot({ path: file });
  placement.push({ index: i, name: b.label, file: path.relative(WORK_ROOT, file), x: 0, y, width: b.width, height: b.height });
  y += b.height + gap;
}

await browser.close();

// 검증
const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass, detail });
for (const b of inspect.boards) {
  const missNums = b.calloutNos.filter((n) => !b.rowNos.includes(n));
  const missCallouts = b.rowNos.filter((n) => !b.calloutNos.includes(n) && n !== 'etc');
  add(`[${b.label}] 폭 1920`, b.width === policy.board.width, `${b.width}px`);
  add(`[${b.label}] 가로 오버플로 없음`, b.horizOverflow === 0, `${b.horizOverflow}px`);
  add(`[${b.label}] 디스크립션 세로 수용`, b.descOverflow === 0, `초과 ${b.descOverflow}px`);
  add(`[${b.label}] 디자인 영역 세로 수용`, b.designOverflow === 0, `초과 ${b.designOverflow}px`);
  add(`[${b.label}] 콜아웃↔Num 일치`, missNums.length === 0 && missCallouts.length === 0,
    `콜아웃만 존재 ${missNums.join(',') || '—'} / 행만 존재 ${missCallouts.join(',') || '—'}`);
  add(`[${b.label}] 빈 행·빈 제목 없음`, b.emptyRows === 0 && b.emptyTitles === 0, `빈행 ${b.emptyRows} 빈제목 ${b.emptyTitles}`);
}
add('레이어명 중복 없음', inspect.dupLabels.length === 0, inspect.dupLabels.join(',') || '—');
add('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | ') || '—');
const realFailures = requestFailures.filter((f) => !f.blocked);
add('자산 요청 실패 없음', realFailures.length === 0, realFailures.map((f) => f.url).join(' | ') || '—');

const passed = checks.every((c) => c.pass);
writeJson(args.placement ? path.resolve(args.placement) : path.join(outDir, 'figma-placement.json'), {
  generatedAt: new Date().toISOString(), gap,
  capture: { count: placement.length, expectedWidth: policy.board.width },
  boards: placement,
});

const report = [
  `# 보드 캡처 검증 — ${path.basename(args.html)}`, '',
  `- 판정: ${passed ? '✅ 통과' : '❌ 실패'} · 보드 ${placement.length}건 · 간격 ${gap}px`, '',
  '| 검사 | 판정 | 상세 |', '|---|---|---|',
  ...checks.map((c) => `| ${c.name} | ${c.pass ? '✅' : '❌'} | ${c.detail} |`), '',
].join('\n');
// 리포트 디렉터리는 반드시 인자로 받는다 — 기본값을 v3 로 두면 기존 산출물을 조용히 덮어쓴다
const reportDir = path.resolve(args.report ?? path.join(path.dirname(new URL('..', import.meta.url).pathname), 'output', 'reports'));
const reportFile = path.join(reportDir, `capture-${path.basename(args.html, '.html')}.md`);
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, report);
console.log(report);
console.log(`placement: ${args.placement ? path.resolve(args.placement) : path.join(outDir, 'figma-placement.json')}\n리포트: ${reportFile}`);
process.exit(passed ? 0 : 1);
