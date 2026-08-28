// planning 문서에서 화면 관련 절 수집 → 디스크립션 작성용 원자료 노트
// 사용: node extract_policy.mjs --screen 01 [--name 회원현황] --out output/policy-notes/01.md
// 산출은 '초안 재료'다 — 최종 descriptions/<화면>.json은 description-rules.md에 따라 사람이/에이전트가 작성한다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, SKILL_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
if (!args.screen) { console.error('필수: --screen NN'); process.exit(2); }
const REPO = path.resolve(SKILL_ROOT, '..');
const P = (f) => path.join(REPO, 'planning', f);
const no = args.screen;
const out = args.out || path.join(SKILL_ROOT, 'output', 'policy-notes', `${no}.md`);

const read = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;

// "### 01 회원 현황" 류의 헤딩부터 다음 동급 헤딩 전까지 절 단위 추출
function sections(md, screenNo) {
  const lines = md.split('\n');
  const found = [];
  const isHit = (t) => new RegExp(`^#{2,4}\\s.*\\b0?${Number(screenNo)}\\b`).test(t) && /[가-힣]/.test(t);
  for (let i = 0; i < lines.length; i++) {
    if (!isHit(lines[i])) continue;
    const level = lines[i].match(/^#+/)[0].length;
    let j = i + 1;
    while (j < lines.length && !(lines[j].match(/^#+\s/) && lines[j].match(/^#+/)[0].length <= level)) j++;
    found.push(lines.slice(i, j).join('\n'));
    i = j - 1;
  }
  return found;
}

// 표·리스트 행 중 화면 번호를 참조하는 행 추출 (39 미결 대장 등 산재형 문서용)
function referencingLines(md, screenNo) {
  const pat = new RegExp(`(^|[^0-9])0?${Number(screenNo)}\\s*(화면|\\b)`);
  return md.split('\n').filter((l) => (l.startsWith('|') || l.trim().startsWith('-')) && pat.test(l) && /[가-힣]/.test(l));
}

const parts = [`# 정책 원자료 노트 — 화면 ${no}${args.name ? ` ${args.name}` : ''}`, '',
  `> 자동 수집(${new Date().toISOString().slice(0, 10)}). 이 노트는 재료이며 서술 정본이 아니다. 출처 문서를 반드시 함께 확인할 것.`, ''];

const srcs = [
  ['38_admin_requirements.md', '요구사항 정의 (본문 행의 뼈대)', 'sections'],
  ['37_admin_operation_policy.md', '운영 정책 (조건·수치·예외)', 'sections'],
  ['39_open_items.md', '미결 대장 (→ 빨강 ※행)', 'lines'],
  ['36_admin_screen_map.md', '화면 맵 (부속 화면 구성)', 'sections'],
];
for (const [file, label, mode] of srcs) {
  const md = read(P(file));
  parts.push(`## ${file} — ${label}`, '');
  if (!md) { parts.push('(파일 없음)', ''); continue; }
  const hits = mode === 'sections' ? sections(md, no) : referencingLines(md, no);
  parts.push(hits.length ? hits.join('\n\n---\n\n') : '(해당 화면 언급 없음 — 수동 확인 필요)', '');
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, parts.join('\n'));
console.log(`정책 노트 저장: ${out} (${parts.join('\n').length}자)`);
