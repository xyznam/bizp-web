// General 표의 실제 열 너비를 브라우저에서 측정해 저장한다.
// 사용: node measure_tables.mjs [--html output/boards-html/general.html] [--out output/general/_colwidths.json]
//
// 폭을 코드로 추정하면 폰트·자간 차이로 반드시 어긋난다('MANAGER'가 두 줄로 접히는 식).
// HTML 보드는 table-layout:auto로 브라우저가 최적 배분하게 두고, 그 결과를 Figma가 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, launchPage, writeJson, WORK_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
const policy = loadPolicy(args.policy);
const html = path.resolve(args.html || path.join(WORK_ROOT, 'output', 'boards-html', 'general.html'));
if (!fs.existsSync(html)) { console.error(`보드 HTML 없음: ${html} (build_board --screen G- 먼저 실행)`); process.exit(2); }

const { browser, page } = await launchPage(policy, { viewport: { width: 2000, height: 1200 } });
await page.goto('file://' + html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const measured = await page.evaluate(() => {
  const out = {};
  for (const board of document.querySelectorAll('.uid-board')) {
    const tables = [...board.querySelectorAll('table.gtbl')].map((t) => {
      const ths = [...t.querySelectorAll('thead th')];
      // 테두리 포함 폭 — Figma 셀도 테두리를 포함해 그린다
      return ths.map((th) => Math.round(th.getBoundingClientRect().width));
    });
    out[board.dataset.label] = tables;
  }
  return out;
});
await browser.close();

const out = args.out || path.join(WORK_ROOT, 'output', 'general', '_colwidths.json');
writeJson(out, { measuredAt: new Date().toISOString(), source: path.relative(WORK_ROOT, html), boards: measured });

const boards = Object.keys(measured).length;
const tables = Object.values(measured).reduce((s, t) => s + t.length, 0);
console.log(`열 너비 실측: ${out}`);
console.log(`보드 ${boards} · 표 ${tables}`);
for (const [label, tbls] of Object.entries(measured).slice(0, 2)) {
  console.log(`  ${label}: ${tbls.slice(0, 3).map((w) => w.join('/')).join('  |  ')}`);
}
