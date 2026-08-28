// 디스크립션 결정론 린트 — 문장부호 금칙·구조 규칙 위반 검출 (description-rules §2-1 등)
// 사용: node lint_descriptions.mjs [--dir output/descriptions] [--report output/reports/lint-descriptions.md]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, WORK_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
const dir = path.resolve(args.dir || path.join(WORK_ROOT, 'output', 'descriptions'));
const issues = [];
const add = (file, kind, detail) => issues.push({ file: path.basename(file), kind, detail });

// 인용부호 안(원문 인용)을 제거한 뒤 금칙 문자를 검사
const stripQuoted = (s) => s
  .replace(/"[^"]*"/g, '""').replace(/“[^”]*”/g, '“”')
  .replace(/'[^']*'/g, "''").replace(/‘[^’]*’/g, '‘’');

const KIND = new Set(['confirm', 'reference', 'common']);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const file = path.join(dir, f);
  let d;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { add(file, 'json', String(e)); continue; }

  const texts = []; // [경로, 텍스트]
  (d.flags ?? []).forEach((fl, i) => {
    if (!KIND.has(fl.kind)) add(file, 'flag-kind', `flags[${i}].kind=${fl.kind}`);
    if (!fl.text?.trim()) add(file, 'empty', `flags[${i}].text`);
    else texts.push([`flags[${i}]`, fl.text]);
  });
  (d.requirements ?? []).forEach((r, i) => {
    if (!/^R\d+$/.test(r.id ?? '')) add(file, 'req-id', `requirements[${i}].id=${r.id}`);
    if (!r.text?.trim()) add(file, 'empty', `requirements[${i}].text`);
    else texts.push([`requirements[${i}]`, r.text]);
  });
  const seen = new Set();
  (d.rows ?? []).forEach((row, i) => {
    if (!row.no?.trim() || !row.title?.trim()) add(file, 'empty', `rows[${i}] no/title`);
    if (seen.has(row.no)) add(file, 'dup-no', `rows[${i}].no=${row.no}`);
    seen.add(row.no);
    if (!row.bullets?.length) add(file, 'empty', `rows[${i}].bullets`);
    texts.push([`rows[${i}].title`, row.title ?? '']);
    (row.bullets ?? []).forEach((b, j) => {
      if (!b.text?.trim()) add(file, 'empty', `rows[${i}].bullets[${j}]`);
      else texts.push([`rows[${i}].b[${j}]`, b.text]);
      if (b.indent != null && ![0, 1, 2].includes(b.indent)) add(file, 'indent', `rows[${i}].bullets[${j}].indent=${b.indent}`);
      if (b.color && !['red', 'green'].includes(b.color)) add(file, 'color', `rows[${i}].bullets[${j}].color=${b.color}`);
    });
    if (!row.callout && !row.nocallout && row.no !== 'etc') add(file, 'no-callout', `rows[${i}] no=${row.no} — callout도 nocallout 선언도 없음`);
  });
  if (!(d.rows ?? []).length) add(file, 'empty', 'rows 없음');

  for (const [loc, t] of texts) {
    const s = stripQuoted(t);
    if (s.includes('·')) add(file, '문장부호·', `${loc}: ${t.slice(0, 70)}`);
    if (s.includes('—')) add(file, '문장부호—', `${loc}: ${t.slice(0, 70)}`);
  }
  // ※행 순서: confirm → reference → common
  const order = (d.flags ?? []).map((fl) => fl.kind);
  const sorted = [...order].sort((a, b) => ['confirm', 'reference', 'common'].indexOf(a) - ['confirm', 'reference', 'common'].indexOf(b));
  if (order.join() !== sorted.join()) add(file, 'flag-order', order.join(' → '));
}

const byKind = {};
for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
const lines = [
  `# 디스크립션 린트 — ${new Date().toISOString().slice(0, 10)}`, '',
  `- 파일 ${fs.readdirSync(dir).filter((x) => x.endsWith('.json')).length} · 위반 ${issues.length}건 ${issues.length ? '❌' : '✅'}`,
  `- 유형: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`, '',
  ...(issues.length ? ['| 파일 | 유형 | 위치 |', '|---|---|---|', ...issues.map((i) => `| ${i.file} | ${i.kind} | ${i.detail.replace(/\|/g, '\\|')} |`)] : []),
];
const report = args.report || path.join(WORK_ROOT, 'output', 'reports', 'lint-descriptions.md');
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, lines.join('\n'));
console.log(lines.slice(0, 4).join('\n'));
console.log(`리포트: ${report}`);
process.exit(issues.length ? 1 : 0);
