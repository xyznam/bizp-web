// 인풋 프로브 — 새 화면군을 파이프라인에 붙이기 전에 '무엇을 가졌는지'를 기계로 확인한다.
//
// 사용: node probe_inputs.mjs --screens <화면HTML 폴더> [--descriptions <기존 디스크립션 폴더>]
//                             [--sample 3] [--out output/reports/probe.md] [--policy <경로>]
//
// 이 스크립트는 판정하지 않는다. ADAPTATION.md 진단표와 workflow/entry-triage.md 판정을
// 사람/AI가 채우는 데 필요한 **사실**만 모은다. 정책 파일이 아직 없어도 동작한다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, getPlaywright, wr } from './lib.mjs';

const args = parseArgs(process.argv);
if (!args.screens) { console.error('필수: --screens <화면 HTML 폴더>'); process.exit(2); }
const screensDir = path.resolve(args.screens);
const sampleN = Number(args.sample ?? 3);
const reportFile = path.resolve(args.out ?? wr('output/reports/probe.md'));

const htmlFiles = fs.readdirSync(screensDir).filter((f) => f.endsWith('.html')).sort();
if (!htmlFiles.length) { console.error(`HTML 없음: ${screensDir}`); process.exit(2); }
// 앞·중간·뒤에서 고르게 뽑는다 (앞쪽만 보면 목록형 화면에 편향된다)
const picks = sampleN >= htmlFiles.length ? htmlFiles
  : [...new Set([0, Math.floor(htmlFiles.length / 2), htmlFiles.length - 1]
    .concat([...Array(sampleN).keys()].map((i) => Math.floor(i * htmlFiles.length / sampleN))))]
    .slice(0, sampleN).map((i) => htmlFiles[i]);

const { chromium } = await getPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// 원격 요청을 기록만 하고 통과시킨다 (차단 정책은 아직 없다 — 무엇을 허용해야 하는지가 프로브 결과)
const remoteHosts = new Set();
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (!url.startsWith('file:') && !url.startsWith('data:')) {
    try { remoteHosts.add(new URL(url).hostname); } catch { /* noop */ }
  }
  return route.continue();
});

const results = [];
for (const file of picks) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const full = path.join(screensDir, file);
  let loadError = null;
  try {
    await page.goto('file://' + full, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
  } catch (e) { loadError = String(e.message || e).split('\n')[0]; }

  const probe = loadError ? null : await page.evaluate(() => {
    // :root CSS 변수 카탈로그
    // file:// 에서 외부 스타일시트는 불투명 출처라 cssRules 접근이 막힌다. 막힌 시트를 세어
    // 보고한다 — 조용히 0으로 넘기면 '토큰이 없는 화면'으로 오독된다. 이것이 파이프라인이
    // static 단일파일 변환을 IR 추출보다 먼저 요구하는 이유다.
    const blockedSheets = [];
    const tokens = {};
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { blockedSheets.push(sheet.href || '(inline)'); continue; }
      for (const rule of rules) {
        if (!rule.style || !/:root/.test(rule.selectorText || '')) continue;
        for (const prop of rule.style) {
          if (prop.startsWith('--')) tokens[prop] = rule.style.getPropertyValue(prop).trim();
        }
      }
    }
    // 클래스 빈도 (레이아웃 셸 후보 추정용)
    const classCount = {};
    for (const el of document.querySelectorAll('*')) {
      for (const c of el.classList) classCount[c] = (classCount[c] ?? 0) + 1;
    }
    // 레이아웃 셸 후보: body 직계·2계층에서 면적이 큰 컨테이너
    const shell = [];
    const consider = [...document.querySelectorAll('body > *, body > * > *')];
    for (const el of consider) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 40000) continue;
      shell.push({
        sel: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + [...el.classList].map((c) => `.${c}`).join(''),
        w: Math.round(r.width), h: Math.round(r.height), pos: getComputedStyle(el).position,
      });
    }
    // 오버레이 후보: 화면을 덮는 fixed 요소 + 이름에 modal/dialog/drawer/backdrop/overlay 가 든 것
    const overlayRe = /(modal|dialog|drawer|backdrop|overlay|popup|sheet)/i;
    const overlays = [...new Set([...document.querySelectorAll('*')]
      .filter((el) => overlayRe.test(el.className && el.className.baseVal !== undefined ? '' : String(el.className || ''))
        || (getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().width > 200))
      .map((el) => el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join('')))].slice(0, 25);
    // 버튼 클래스 빈도 (기본 액션 버튼 후보)
    const btnClasses = {};
    for (const el of document.querySelectorAll('button, a[role=button], [class*=btn]')) {
      for (const c of el.classList) btnClasses[c] = (btnClasses[c] ?? 0) + 1;
    }
    // 반응형 신호
    const mediaQueries = new Set();
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) if (rule.media) mediaQueries.add(rule.conditionText || rule.media.mediaText);
    }
    return {
      tokens, classCount, shell, overlays, btnClasses, blockedSheets,
      mediaQueries: [...mediaQueries].slice(0, 20),
      docHeight: Math.ceil(document.documentElement.scrollHeight),
      externalRefs: [...document.querySelectorAll('link[href], script[src], img[src]')]
        .map((el) => el.getAttribute('href') || el.getAttribute('src'))
        .filter((u) => u && !u.startsWith('data:')),
    };
  });
  results.push({ file, loadError, consoleErrors, probe });
  await page.close();
}
await browser.close();

// ── 기존 디스크립션 스키마 적합률 (있을 때만) ──
let descReport = null;
if (args.descriptions) {
  const dir = path.resolve(args.descriptions);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const stat = { total: files.length, parsed: 0, hasRows: 0, hasFlags: 0, hasCallout: 0, hasRequirements: 0, rowsTotal: 0, calloutRows: 0, broken: [] };
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { stat.broken.push(`${f}: ${e.message}`); continue; }
    stat.parsed++;
    if (Array.isArray(d.rows) && d.rows.length) stat.hasRows++;
    if (Array.isArray(d.flags) && d.flags.length) stat.hasFlags++;
    if (Array.isArray(d.requirements) && d.requirements.length) stat.hasRequirements++;
    for (const r of d.rows ?? []) { stat.rowsTotal++; if (r.callout?.selector || r.callout?.bbox || r.nocallout) stat.calloutRows++; }
    if ((d.rows ?? []).some((r) => r.callout?.selector)) stat.hasCallout++;
  }
  descReport = stat;
}

// ── 리포트 ──
const agg = (key) => {
  const m = {};
  for (const r of results) for (const [k, v] of Object.entries(r.probe?.[key] ?? {})) m[k] = (m[k] ?? 0) + v;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const tokenUnion = {};
for (const r of results) Object.assign(tokenUnion, r.probe?.tokens ?? {});

const L = [];
L.push('# 인풋 프로브 리포트', '');
L.push(`- 대상 폴더 : \`${screensDir}\``);
L.push(`- HTML ${htmlFiles.length}건 중 ${picks.length}건 표본 : ${picks.join(', ')}`);
L.push(`- 생성 : ${new Date().toISOString()}`, '');

L.push('## 1. 렌더 가능성 (G1 이행 판정의 전제)', '');
L.push('| 화면 | 로드 | 콘솔 오류 | 문서 높이 |', '|---|---|---:|---:|');
for (const r of results) {
  L.push(`| ${r.file} | ${r.loadError ? '실패 : ' + r.loadError : '성공'} | ${r.consoleErrors.length} | ${r.probe?.docHeight ?? '-'} |`);
}
const errs = results.flatMap((r) => r.consoleErrors);
if (errs.length) { L.push('', '콘솔 오류 표본:', '', ...[...new Set(errs)].slice(0, 8).map((e) => `- \`${e}\``)); }
L.push('');

L.push('## 2. CSS 변수 카탈로그 → `tokens.groups`', '');
const blocked = [...new Set(results.flatMap((r) => r.probe?.blockedSheets ?? []))];
const toks = Object.entries(tokenUnion);
if (blocked.length) {
  L.push('> **읽을 수 없는 스타일시트가 있다.** `file://` 에서 외부 CSS 는 불투명 출처라 규칙을 읽지 못한다.');
  L.push('> 아래 토큰·미디어쿼리 수치는 **과소 집계**다. `01-static` 단계(CSS 인라인 단일파일 변환)를 먼저 끝내고 프로브를 다시 돌린다.', '');
  L.push(...blocked.slice(0, 8).map((h) => `> - \`${h}\``), '');
}
L.push(`총 ${toks.length}개${blocked.length ? ' (과소 집계)' : ''}. 색으로 보이는 값과 치수 값을 나눠 정책의 \`tokens.groups\`에 배정한다.`, '');
const isColor = (v) => /^#|^rgb|^hsl/i.test(v.trim());
L.push('| 그룹 후보 | 변수 |', '|---|---|');
L.push(`| color | ${toks.filter(([, v]) => isColor(v)).map(([k]) => `\`${k}\``).join(', ') || '없음'} |`);
L.push(`| layout/기타 | ${toks.filter(([, v]) => !isColor(v)).map(([k]) => `\`${k}\``).join(', ') || '없음'} |`);
L.push('');

L.push('## 3. 레이아웃 셸 후보 → `domContract.contentRoot`', '');
L.push('본문 컨테이너를 고른다. 사이드바·상단바를 제외하고 화면 콘텐츠만 담는 것이 맞다.', '');
L.push('| 화면 | 후보 (폭×높이, position) |', '|---|---|');
for (const r of results) {
  L.push(`| ${r.file} | ${(r.probe?.shell ?? []).slice(0, 6).map((s) => `\`${s.sel}\` ${s.w}×${s.h} ${s.pos}`).join('<br>') || '-'} |`);
}
L.push('');

L.push('## 4. 오버레이 후보 → `domContract.overlay*` · `auxFrameSelectors`', '');
const ov = [...new Set(results.flatMap((r) => r.probe?.overlays ?? []))];
L.push(ov.length ? ov.map((s) => `- \`${s}\``).join('\n') : '- 후보 없음 (부속 화면이 없거나 다른 방식으로 렌더됨)');
L.push('');

L.push('## 5. 버튼 클래스 빈도 → `domContract.primaryActionSelectors` · `componentPromotion.variantClasses`', '');
L.push(agg('btnClasses').slice(0, 15).map(([c, n]) => `- \`.${c}\` ${n}회`).join('\n') || '- 없음');
L.push('');

L.push('## 6. 반복 클래스 상위 → 컴포넌트 승격 후보', '');
L.push(agg('classCount').slice(0, 20).map(([c, n]) => `- \`.${c}\` ${n}회`).join('\n') || '- 없음');
L.push('');

L.push('## 7. 외부 참조 · 원격 호스트 → `allowedRemoteHosts` · static 변환 대상', '');
const refs = [...new Set(results.flatMap((r) => r.probe?.externalRefs ?? []))];
L.push('인라인해야 할 로컬 자산:', '');
L.push(refs.filter((u) => !/^https?:/.test(u)).map((u) => `- \`${u}\``).join('\n') || '- 없음 (이미 단일 파일일 수 있음)');
L.push('', '원격 호스트:', '');
L.push([...remoteHosts].map((h) => `- \`${h}\``).join('\n') || '- 없음');
L.push('');

L.push('## 8. 반응형 신호 (다중 뷰포트 결정 트리거)', '');
const mq = [...new Set(results.flatMap((r) => r.probe?.mediaQueries ?? []))];
if (mq.length) {
  L.push('**미디어 쿼리가 발견됐다. 보드 규격 결정이 선행 과제다** — ADAPTATION.md §다중 뷰포트를 읽고 결정한 뒤 진행한다.', '');
  L.push(...mq.slice(0, 12).map((m) => `- \`${m}\``));
} else if (blocked.length) {
  L.push('미디어 쿼리 0건이지만 **읽지 못한 스타일시트가 있어 신뢰할 수 없다.** static 변환 후 재측정한다.');
} else {
  L.push('미디어 쿼리 없음. 단일 뷰포트로 진행 가능.');
}
L.push('');

if (descReport) {
  L.push('## 9. 기존 디스크립션 스키마 적합률 (진입 판정 재료)', '');
  const d = descReport;
  L.push(`- 파일 ${d.total}건 중 파싱 성공 ${d.parsed}건`);
  L.push(`- \`rows\` 보유 ${d.hasRows} · \`flags\` 보유 ${d.hasFlags} · \`requirements\` 보유 ${d.hasRequirements}`);
  L.push(`- \`callout.selector\` 보유 파일 ${d.hasCallout}건 · 콜아웃 지정된 행 ${d.calloutRows}/${d.rowsTotal}`);
  if (d.broken.length) L.push('', '파싱 실패:', '', ...d.broken.slice(0, 5).map((b) => `- ${b}`));
  L.push('');
  const ratio = d.rowsTotal ? d.calloutRows / d.rowsTotal : 0;
  L.push(ratio > 0.8
    ? '> 콜아웃 보유율이 높다. **표기 결손**일 가능성이 크다 → 이행 경로를 파일럿으로 검증한다.'
    : '> 콜아웃 보유율이 낮다. **구조 결손** 의심 → workflow/entry-triage.md 의 파일럿 1건 실측으로 확정한다.');
  L.push('');
}

L.push('## 다음 할 일', '');
L.push('1. `ADAPTATION.md` 진단표를 위 사실로 채운다');
L.push('2. `adapters/board-policy.template.json` 을 복사해 `board-policy.json` 을 쓴다 (TODO 전량 해소)');
L.push('3. `workflow/entry-triage.md` 로 게이트별 재생성/이행/재작성을 선언한다');
L.push('4. 파일럿 1건으로 선언을 실측 검증한다');

fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, L.join('\n') + '\n');
console.log(`프로브 리포트: ${reportFile}`);
console.log(`화면 ${htmlFiles.length}건 · 표본 ${picks.length}건 · CSS 변수 ${toks.length}개 · 오버레이 후보 ${ov.length}건 · 미디어쿼리 ${mq.length}건`);
if (blocked.length) console.warn(`⚠ 읽지 못한 스타일시트 ${blocked.length}건 — CSS 통계는 과소 집계다. static 변환 후 재실행할 것.`);
if (results.some((r) => r.loadError)) console.warn('⚠ 로드 실패 화면이 있다. static 변환 전 원인을 먼저 해소한다.');
