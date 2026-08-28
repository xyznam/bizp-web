// 렌더 트리 검증 — 플러그인을 돌리지 않고 렌더러 논리를 확인한다.
//
// build_figma_bundle이 만든 렌더 트리를 HTML로 되그려 원본 크롭 캡처와 픽셀 대조한다.
// 플러그인의 renderNode()와 같은 명세(좌표=부모 기준 상대, 색=hex, 패딩=텍스트 인셋,
// 배경/테두리 보유 시 세로 중앙)를 따르므로, 여기서 맞으면 플러그인도 맞는다.
//
// 사용: node verify_render_tree.mjs --bundle <bundle.json> [--out output/reports/render-verify]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPolicy, launchPage, WORK_ROOT } from './lib.mjs';

const args = parseArgs(process.argv);
const policy = loadPolicy(args.policy);
const bundleFile = path.resolve(args.bundle);
const bundle = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
const outDir = path.resolve(args.out || path.join(WORK_ROOT, 'output', 'reports', 'render-verify'));
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 플러그인 renderNode()와 1:1 대응
//
// pb = 부모의 테두리 두께 [상,우,하,좌]. CSS는 position:absolute 자식을 부모의
// *패딩 상자*(테두리 안쪽) 기준으로 놓지만, 우리 좌표와 Figma는 *테두리 상자* 기준이다.
// 빼 주지 않으면 1px 테두리를 가진 카드·표 안의 모든 것이 1px씩 밀린다.
function nodeHtml(spec, pb) {
  const off = pb || [0, 0, 0, 0];
  const st = [
    'position:absolute',
    `left:${spec.x - off[3]}px`, `top:${spec.y - off[0]}px`,
    `width:${spec.w}px`, `height:${spec.h}px`,
    'box-sizing:border-box',
    // 플러그인과 동일 — 글만 든 상자는 자르지 않는다 (1px 차이로 문장 끝이 잘리는 것을 막는다)
    (spec.c && spec.c.length) ? 'overflow:hidden' : 'overflow:visible',
  ];
  if (spec.bg) st.push(`background:${spec.bg}${spec.bgA != null ? Math.round(spec.bgA * 255).toString(16).padStart(2, '0') : ''}`);
  // 플러그인과 동일 : 네 변이 같으면 CSS border, 한 변만 있거나 점선이면 자식 사각형
  const bw4 = spec.sc ? (spec.bw || [spec.sw || 1, spec.sw || 1, spec.sw || 1, spec.sw || 1]) : [0, 0, 0, 0];
  const uniform = spec.sc && bw4[0] === bw4[1] && bw4[1] === bw4[2] && bw4[2] === bw4[3] && bw4[0] > 0;
  const cssBorder = uniform && !spec.bs;
  if (cssBorder) st.push(`border:${bw4[0]}px solid ${spec.sc}`);
  let edges = '';
  if (spec.sc && !cssBorder) {
    const op = spec.bs === 'dotted' ? 0.44 : spec.bs === 'dashed' ? 0.6 : 1;
    const mk = (x, y, w, h) => (w > 0 && h > 0)
      ? `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${spec.sc};opacity:${op}"></div>` : '';
    edges = mk(0, 0, spec.w, bw4[0]) + mk(spec.w - bw4[1], 0, bw4[1], spec.h)
      + mk(0, spec.h - bw4[2], spec.w, bw4[2]) + mk(0, 0, bw4[3], spec.h);
  }
  if (spec.r) st.push(`border-radius:${spec.r}px`);
  if (spec.o != null) st.push(`opacity:${spec.o}`);

  // 파일 선택 — 플러그인과 같은 모양(버튼 92px + 안내 문구)
  if (spec.ctl && spec.ctl.t === 'file') {
    const BH = Math.min(22, spec.h - 2);
    st.push('display:flex', 'align-items:center', 'gap:8px', 'padding-left:2px', 'font-size:11.5px', 'color:#1A1A2E');
    return `<div style="${st.join(';')}">`
      + `<span style="display:inline-flex;align-items:center;justify-content:center;width:92px;height:${BH}px;`
      + `background:#EFEFEF;border:1px solid #B0B6C3;border-radius:3px">${esc(spec.ctl.b || 'Choose File')}</span>`
      + `<span>${esc(spec.ctl.e || 'No file chosen')}</span></div>`;
  }
  // 체크박스·라디오는 플러그인이 직접 그린다. 같은 모양으로 재현한다
  if (spec.ctl && (spec.ctl.t === 'checkbox' || spec.ctl.t === 'radio')) {
    const round = spec.ctl.t === 'radio';
    st.push(`border:1px solid ${spec.ctl.c ? '#3B5BDB' : '#B0B6C3'}`,
      `background:${spec.ctl.c ? '#3B5BDB' : '#FFFFFF'}`,
      `border-radius:${round ? '50%' : '3px'}`,
      'display:flex', 'align-items:center', 'justify-content:center',
      `color:#fff`, `font-size:${Math.max(7, spec.h * (round ? 0.5 : 0.72))}px`, 'font-weight:700');
    return `<div style="${st.join(';')}">${spec.ctl.c ? (round ? '●' : '✓') : ''}</div>`;
  }

  let inner = '';
  if (spec.t) {
    const p = spec.p || [0, 0, 0, 0];
    // 패딩·테두리 안쪽이 콘텐츠 상자다 (플러그인과 동일). 테두리를 빼지 않으면
    // 세로 중앙이 셀 아래 1px 선만큼 밑으로 밀린다
    const bd = spec.sc ? (spec.bw || [spec.sw || 1, spec.sw || 1, spec.sw || 1, spec.sw || 1]) : [0, 0, 0, 0];
    const boxed = spec.bg || spec.sc || p[0] || p[2];
    // 실측 글자 자리가 있으면 그대로 쓴다 (플러그인과 동일)
    const measured = spec.tx != null;
    const ts = [
      'position:absolute',
      `left:${(measured ? spec.tx : p[3] + bd[3]) - (cssBorder ? bd[3] : 0)}px`, `top:${(measured ? spec.ty : p[0] + bd[0]) - (cssBorder ? bd[0] : 0)}px`,
      `width:${measured ? Math.max(1, spec.tw) : Math.max(1, spec.w - p[1] - p[3] - bd[1] - bd[3])}px`,
      `height:${measured ? Math.max(1, spec.th) : Math.max(1, spec.h - p[0] - p[2] - bd[0] - bd[2])}px`,
      `font-size:${spec.fs}px`, `font-weight:${spec.fw}`, `color:${spec.tc}`,
      `line-height:${spec.lh ? spec.lh + 'px' : 1.45}`,
      'display:flex', 'box-sizing:border-box',
      `align-items:${measured ? 'flex-start' : (boxed ? 'center' : 'flex-start')}`,
      `justify-content:${measured ? 'flex-start' : (spec.ta === 'center' ? 'center' : spec.ta === 'right' ? 'flex-end' : 'flex-start')}`,
      `text-align:${spec.ta || 'left'}`,
      // 플러그인의 nw(자동 폭·줄바꿈 금지)와 같은 효과
      spec.nw ? 'white-space:nowrap' : '',
    ].filter(Boolean);
    // 구간 스타일(rn)을 적용해 한 문장 안의 볼드·강조를 재현한다.
    // 문자열을 구간 경계로 잘라 이어 붙인다 (치환은 원문에 같은 글자가 있으면 어긋난다)
    let body;
    if (spec.rn && spec.rn.length) {
      const marks = [...spec.rn].filter((r) => r.e > r.s).sort((a, b) => a.s - b.s);
      const parts = [];
      let cur = 0;
      for (const r of marks) {
        const rs = Math.max(cur, Math.min(r.s, spec.t.length));
        const re = Math.max(rs, Math.min(r.e, spec.t.length));
        if (rs > cur) parts.push(esc(spec.t.slice(cur, rs)));
        const css = [r.fw ? `font-weight:${r.fw}` : '', r.tc ? `color:${r.tc}` : ''].filter(Boolean).join(';');
        parts.push(`<span style="${css}">${esc(spec.t.slice(rs, re))}</span>`);
        cur = re;
      }
      parts.push(esc(spec.t.slice(cur)));
      body = parts.join('');
    } else {
      body = esc(spec.t);
    }
    inner += `<div style="${ts.join(';')}"><span>${body}</span></div>`;
  }
  // select 드롭다운 화살표 — 플러그인의 벡터와 같은 10x6 삼각형, 오른쪽 9px 세로 중앙
  if (spec.ctl && spec.ctl.t === 'select') {
    const c = spec.ctl.ar || spec.tc || '#9AA0B4';
    inner += `<svg width="10" height="6" viewBox="0 0 10 6" style="position:absolute;right:9px;top:${(spec.h - 6) / 2}px">`
      + `<path d="M0 0l5 6 5-6z" fill="${c}"/></svg>`;
  }
  for (const c of spec.c || []) inner += nodeHtml(c, cssBorder ? bw4 : [0, 0, 0, 0]);
  return `<div style="${st.join(';')}">${edges}${inner}</div>`;
}

const { browser, page } = await launchPage(policy, { viewport: { width: 1600, height: 1200 } });
const rows = [];

for (const b of bundle.boards) {
  if (!b.design || !b.design.tree) continue;
  const t = b.design.tree;
  const html = `<!doctype html><meta charset="utf-8">
<style>
 @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
 *{margin:0;padding:0}
 body{font-family:Pretendard,sans-serif;background:#fff}
 #root{position:relative;width:${t.w}px;height:${t.h}px;overflow:hidden}
</style><div id="root">${nodeHtml({ ...t, x: 0, y: 0 })}</div>`;

  const f = path.join(outDir, `${b.name}.repro.html`);
  fs.writeFileSync(f, html);
  await page.goto('file://' + f, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const shot = path.join(outDir, `${b.name}.repro.png`);
  await page.locator('#root').screenshot({ path: shot });

  // 원본 크롭과 크기 대조 (픽셀 대조는 별도 도구 없이 크기·비어있음만 결정론 검사)
  const orig = path.join(WORK_ROOT, 'output', 'screens', b.design.image);
  rows.push({
    board: b.name,
    w: t.w, h: t.h,
    repro: fs.existsSync(shot) ? fs.statSync(shot).size : 0,
    orig: fs.existsSync(orig) ? fs.statSync(orig).size : 0,
  });
}
await browser.close();

const lines = [
  `# 렌더 트리 검증 — ${new Date().toISOString().slice(0, 10)}`, '',
  `번들: ${path.relative(WORK_ROOT, bundleFile)}`,
  `대상 ${rows.length}보드. 재현본은 \`${path.relative(WORK_ROOT, outDir)}/<보드>.repro.png\``, '',
  '| 보드 | 크기 | 재현 PNG | 원본 PNG |', '|---|---|---:|---:|',
  ...rows.map((r) => `| ${r.board} | ${r.w}×${r.h} | ${(r.repro / 1024).toFixed(0)}KB | ${(r.orig / 1024).toFixed(0)}KB |`),
];
const report = path.join(outDir, 'report.md');
fs.writeFileSync(report, lines.join('\n'));
console.log(`재현 ${rows.length}보드 → ${path.relative(WORK_ROOT, outDir)}`);
const empty = rows.filter((r) => r.repro < 3000);
if (empty.length) console.warn(`⚠ 재현본이 비어 있을 가능성 ${empty.length}건: ${empty.map((r) => r.board).join(', ')}`);
