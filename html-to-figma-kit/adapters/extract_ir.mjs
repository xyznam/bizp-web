// static HTML → IR JSON (토큰 참조 보존) + 화면·부속 스크린샷
// 사용: node extract_ir.mjs --html <절대경로>.html --out output/ir/01.json
//
// ── 어댑터 파일이다 (T2) ──
// 화면 골격·모달 패턴·기본 버튼 클래스는 화면군마다 다르다. 그 값들은 코드가 아니라
// board-policy.json 의 extraction.domContract 에 있다. 새 화면군에 붙일 때는
// ADAPTATION.md 진단표를 채워 domContract 를 쓰고, 이 파일은 원칙적으로 손대지 않는다.
// 그래도 안 잡히는 구조(예: shadow DOM, 라우팅형 SPA)면 그때 이 파일을 포크한다.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs, loadPolicy, launchPage, writeJson, WORK_ROOT } from '../engine/scripts/lib.mjs';

const args = parseArgs(process.argv);
if (!args.html || !args.out) { console.error('필수: --html --out'); process.exit(2); }
const policy = loadPolicy(args.policy);

// ── DOM 계약 — 화면군별 교체 지점. 기본값은 admin-v3 실측값(examples/admin-v3 참조) ──
const DC = policy.extraction?.domContract ?? {};
const DOM = {
  // 사이드바·상단바를 제외한 본문 컨테이너. main-crop 프레임과 폼 조작 범위의 기준
  contentRoot: DC.contentRoot ?? '.main',
  // 모달·드로어를 감싸는 오버레이 컨테이너 (열림 상태 해제·딤 제거 대상)
  overlayContainers: DC.overlayContainers ?? '.modal-backdrop, .pii-backdrop, [class*=backdrop]',
  // 오버레이가 '열림'을 나타내는 클래스명
  overlayOpenClass: DC.overlayOpenClass ?? 'open',
  // display:none 인 오버레이를 강제 표시할 때 flex 로 되살릴 대상 (그 외는 block)
  overlayFlexSelector: DC.overlayFlexSelector ?? '.modal-backdrop',
  // 조상 사슬에서 '딤 배경을 가진 요소'를 식별하는 클래스명 부분 문자열
  overlayNamePattern: DC.overlayNamePattern ?? 'backdrop',
  // 모달 안의 기본 확정 버튼 (2단계 연쇄 진입에 사용)
  primaryActionSelectors: DC.primaryActionSelectors ?? '.btn-primary, .btn.btn-primary',
  // 본문 폼의 제출 버튼 — {root} 는 contentRoot 로 치환된다
  formSubmitSelectors: DC.formSubmitSelectors ?? '{root} .btn-primary, .form-actions button, .card-foot button',
  // 부속 화면을 여는 트리거 후보. 앞 그룹일수록 가능성이 높다고 보고 먼저 시도한다
  triggerGroups: DC.triggerGroups ?? [
    '[data-modal-open]',
    '[data-act]',
    '[data-tr-bulk], [data-bulk-action], .bulk-bar button',
    '.tbl-wrap button:not(.tbl-refresh):not(.pagination *)',
    '.page-actions button, .pii-btn',
    '.tbl tbody tr td:not(.col-check)',
  ],
  // auxId 에 이 패턴이 걸리면 함께 시도할 전용 트리거 (없으면 null)
  namedTriggers: DC.namedTriggers ?? [{ match: 'pii', selector: '.pii-btn' }],
};
DOM.formSubmitSelectors = DOM.formSubmitSelectors.replaceAll('{root}', DOM.contentRoot);
const outFile = path.resolve(args.out);
const screenNo = path.basename(args.html).match(/^(\d+)/)?.[1] ?? path.basename(args.html, '.html');
const screensDir = path.join(WORK_ROOT, 'output', 'screens');

const { browser, page, consoleErrors, requestFailures } = await launchPage(policy);
const PAGE_URL = 'file://' + path.resolve(args.html);
await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
// 브라우저가 돌려주는 정규화(퍼센트 인코딩) URL을 이탈 판정 기준으로 삼는다.
// 원본 문자열과 직접 비교하면 한글 경로에서 항상 불일치로 잡힌다.
const PAGE_URL_CANON = page.url();
await page.evaluate(() => document.fonts.ready);

// ── 0) 프로토타입 전용 블록 제거 (PLAN 4-2) ──
// 원본 HTML은 손대지 않고 이 페이지의 DOM에서만 뺀다. 스크린샷·bbox 측정보다 반드시 먼저
// 실행해야 제거로 생기는 레이아웃 이동이 좌표에 반영된다.
const stripSelectors = policy.extraction.boardStrip?.selectors ?? [];
const stripped = await page.evaluate((sels) => {
  const count = {};
  for (const sel of sels) {
    const nodes = document.querySelectorAll(sel);
    count[sel] = nodes.length;
    for (const n of nodes) n.remove();
  }
  return count;
}, stripSelectors);
const strippedTotal = Object.values(stripped).reduce((a, b) => a + b, 0);
if (strippedTotal) {
  console.log(`제거: ${Object.entries(stripped).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(', ')}`);
}
await page.waitForTimeout(80); // 리플로우 안정화

// position:fixed 요소(사이드바)가 전체 높이로 렌더되도록 뷰포트를 문서 높이에 맞춤
const docH = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
await page.setViewportSize({ width: 1400, height: Math.min(docH, 8000) });
await page.waitForTimeout(150);

// ── 1) 메인 화면 전체 스크린샷 (부속 강제 표시 전) ──
fs.mkdirSync(screensDir, { recursive: true });
const mainShot = path.join(screensDir, `${screenNo}.png`);
await page.screenshot({ path: mainShot, fullPage: true });

// 본문 콘텐츠 크롭본 (사이드바/상단바 제외 변형용) — 있으면 함께 저장
const mainCropShot = path.join(screensDir, `${screenNo}__main.png`);
const mainCropBBox = await page.evaluate((root) => {
  const el = document.querySelector(root); if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.x + scrollX, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 10) / 10);
}, DOM.contentRoot);
if (mainCropBBox) await page.locator(DOM.contentRoot).screenshot({ path: mainCropShot });

// ── 1b) lazy 부속 화면 실체화 (클릭 트리거 → 즉시 재은닉) ──
for (const sel of policy.extraction.auxActivate?.[screenNo] ?? []) {
  try {
    await page.locator(sel).first().click({ timeout: 3000 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  } catch { console.warn(`⚠ auxActivate 실패: ${sel}`); }
}
// 열린 채 남은 오버레이 강제 은닉 (메인 트리 오염 방지)
await page.evaluate((sel) => {
  for (const b of document.querySelectorAll(sel)) {
    if (getComputedStyle(b).display !== 'none') b.style.display = 'none';
  }
}, DOM.overlayContainers);

// ── 2) IR 추출 (페이지 컨텍스트) ──
const extractFn = (cfg) => {
  const norm = (v) => {
    if (!v) return v;
    const m = v.match(/^#([0-9a-f]{3,8})$/i);
    if (!m) return v.replace(/\s+/g, ' ').trim();
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return h.length === 8 ? `rgba(${r}, ${g}, ${b}, ${parseInt(h.slice(6), 16) / 255})` : `rgb(${r}, ${g}, ${b})`;
  };

  // 토큰 카탈로그 (:root) + 값→토큰 역인덱스 + var() 사용 규칙 색인
  const tokens = {}; const ruleIndex = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (!rule.style) continue;
      for (const prop of rule.style) {
        const raw = rule.style.getPropertyValue(prop).trim();
        if (prop.startsWith('--') && /:root/.test(rule.selectorText)) tokens[prop] = raw;
        else if (raw.includes('var(--')) {
          const vars = [...raw.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]);
          ruleIndex.push({ sel: rule.selectorText, prop, vars, raw });
        }
      }
    }
  }
  const valueToToken = {};
  for (const [name, val] of Object.entries(tokens)) {
    const n = norm(val);
    valueToToken[n] = valueToToken[n] === undefined ? name : null; // null = 중복(모호)
  }

  const stats = { nodes: 0, tokenRefs: 0, unresolved: 0 };
  const sigCount = {};
  // OPTION은 bbox가 0이고 화면에 나타나지 않는다. 보이는 값은 select 노드가 갖는다
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'TITLE', 'OPTION']);

  const paintRef = (el, cssProps, computed) => {
    // 규칙 색인 우선(축약형 background/border 포함) → 값 역인덱스 → 리터럴(unresolved)
    for (const r of ruleIndex) {
      if (!cssProps.includes(r.prop)) continue;
      let hit = false; try { hit = el.matches(r.sel); } catch { /* :hover 등 */ }
      if (!hit) continue;
      for (const v of r.vars) if (tokens[v] !== undefined && norm(tokens[v]) === computed) { stats.tokenRefs++; return { ref: v }; }
    }
    const tok = valueToToken[computed];
    if (tok) { stats.tokenRefs++; return { ref: tok }; }
    stats.unresolved++; return { value: computed, unresolved: true };
  };

  // 텍스트 노드를 시각적 줄 단위로 쪼갠다.
  // 여러 줄에 걸친 것을 상자 하나로 내면 Figma에서 다시 줄바꿈되며 원본과 달라지고,
  // 첫 줄이 형제(배지·링크) 뒤에서 시작하는 경우 합집합 상자가 그 형제를 덮어 버린다.
  const splitLinesOf = (tn) => {
    const rd = (v) => Math.round(v * 10) / 10;
    const s = tn.textContent;
    const out = [];
    let start = 0, top = null, cur = null;
    const flush = (end) => {
      const t = s.slice(start, end).trim();
      if (t && cur) out.push({ text: t.slice(0, 200), lines: 1, bbox: [rd(cur.x), rd(cur.y), rd(cur.w), rd(cur.h)] });
    };
    for (let i = 0; i < s.length; i++) {
      const cr = document.createRange();
      cr.setStart(tn, i); cr.setEnd(tn, i + 1);
      const rs = [...cr.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      if (!rs.length) continue;
      const q = rs[0];
      if (top === null || Math.abs(q.top - top) > 1) {
        if (top !== null) flush(i);
        top = q.top; start = i;
        cur = { x: q.x + scrollX, y: q.y + scrollY, w: q.width, h: q.height };
      } else {
        cur.w = Math.max(cur.w, q.x + scrollX + q.width - cur.x);
        cur.h = Math.max(cur.h, q.height);
      }
    }
    if (top !== null) flush(s.length);
    return out;
  };

  // 의사요소 구간 — 바탕과 다른 굵기·색만 싣는다
  const pseudoRun = (s, e, p, cs, el, paint) => {
    const r = { s, e };
    if (p.weight !== cs.fontWeight) r.weight = p.weight;
    if (p.color !== cs.color) r.color = paint(el, ['color'], p.color);
    return r;
  };

  const walk = (el, forceVisible) => {
    if (SKIP.has(el.tagName)) return null;
    const cs = getComputedStyle(el);
    if (!forceVisible && (cs.display === 'none' || cs.visibility === 'hidden')) return null;
    stats.nodes++;
    const r = el.getBoundingClientRect();
    const node = {
      tag: el.tagName.toLowerCase(),
      name: el.classList.length ? [...el.classList].join(' ') : el.tagName.toLowerCase(),
      bbox: [r.x + scrollX, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 10) / 10),
    };
    if (el.id) node.id = el.id;
    if (el.classList.length >= 1) {
      const sig = [...el.classList].sort().join(' ');
      sigCount[sig] = (sigCount[sig] || 0) + 1;
    }
    // 레이아웃
    if (cs.display.includes('flex') || cs.display.includes('grid')) {
      node.layout = {
        mode: cs.display.includes('grid') ? 'grid' : (cs.flexDirection.startsWith('column') ? 'flex-col' : 'flex-row'),
        gap: cs.gap, align: cs.alignItems, justify: cs.justifyContent,
      };
    }
    const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft];
    if (pad.some((p) => p !== '0px')) node.padding = pad;
    if (cs.position !== 'static') node.position = cs.position;
    if (cs.borderRadius !== '0px') node.radius = cs.borderRadius;
    // 페인트 → 토큰 참조
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') node.fills = [paintRef(el, ['background', 'background-color'], cs.backgroundColor)];
    // 테두리는 변별로 싣는다. 네 변을 하나로 뭉뚱그리면 구분선(border-top 1px)이
    // 사각형 박스로 그려진다 (모달 푸터·표 구분선이 전부 상자가 됐다).
    const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
    // 투명 테두리(`border:1px solid transparent`)는 레이아웃 안정용이라 화면에 없다
    const visibleEdge = (s) => parseFloat(cs[`border${s}Width`]) > 0
      && cs[`border${s}Style`] !== 'none'
      && !/^rgba\(.*,\s*0\)$/.test(cs[`border${s}Color`]);
    const on = SIDES.map((s) => (visibleEdge(s) ? s : null));
    if (on.some(Boolean)) {
      // 색은 존재하는 첫 변 기준으로 한 번만 해석한다. 변마다 paintRef를 부르면
      // 같은 테두리가 최대 4번 집계되어 토큰 매핑률 지표가 왜곡된다.
      const first = on.find(Boolean);
      const paint = paintRef(el, ['border', 'border-color', `border-${first.toLowerCase()}`, `border-${first.toLowerCase()}-color`], cs[`border${first}Color`]);
      node.strokes = [{ width: cs[`border${first}Width`], ...paint }];
      // 점선/파선을 실선으로 그리면 그 칸만 유독 진한 선으로 보인다
      // (개인정보 마스킹 셀의 border-bottom:1px dotted)
      const st = cs[`border${first}Style`];
      if (st === 'dotted' || st === 'dashed') node.borderStyle = st;
      // 변별 두께 — 없는 변은 0. 구분선(border-top만)이 사각형 상자로 그려지는 것을 막는다
      const w = SIDES.map((s) => (on[SIDES.indexOf(s)] ? parseFloat(cs[`border${s}Width`]) : 0));
      if (w.some((v) => v === 0)) node.borderWidths = w;
    }
    // 네이티브 폼 위젯은 배경·테두리가 계산 스타일에 없어 그대로 두면 사라진다
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      node.control = { type: el.type, checked: !!el.checked, disabled: !!el.disabled };
    }
    // select의 드롭다운 화살표는 background-image(SVG data URI)라 backgroundColor에 안 잡힌다.
    // 색은 하드코딩하지 않고 그 data URI에서 뽑는다
    if (el.tagName === 'SELECT') {
      const bi = cs.backgroundImage || '';
      const m = bi.match(/fill='%23([0-9a-fA-F]{3,6})'/) || bi.match(/fill="#([0-9a-fA-F]{3,6})"/);
      node.control = { type: 'select', arrow: m ? `#${m[1]}` : null, padRight: parseFloat(cs.paddingRight) || 0 };
    }
    // 파일 선택도 네이티브 위젯이라 배경·테두리·텍스트가 전부 없어 통째로 사라진다
    if (el.tagName === 'INPUT' && el.type === 'file') node.control = { type: 'file' };
    // 텍스트
    //  · select : 자식 option이 아니라 선택된 option의 라벨이 화면에 보이는 값
    //  · input  : value 또는 placeholder가 보이는 값 (textContent는 비어 있다)
    //  · 리프    : 전체 텍스트
    //  · 인라인 자식만 가진 요소 : "열람하는 개인정보를 <strong>업무 용도로만 사용</strong>하며 …"
    //    처럼 한 문장이다. 조각으로 나누면 볼드 좌우가 각각 다른 텍스트 상자가 되고,
    //    줄바꿈된 조각끼리 겹쳐 글자가 잘린다. 한 상자에 담고 구간 스타일(runs)만 입힌다.
    const tag = el.tagName;
    const isSelect = tag === 'SELECT';
    // 체크박스·라디오는 value가 기본 "on"이지만 화면에 글자가 없다. 글이 있는 입력만 고른다
    const TEXTY = ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', 'datetime-local', 'month', 'time', 'week'];
    const isField = tag === 'TEXTAREA' || (tag === 'INPUT' && TEXTY.indexOf((el.type || 'text').toLowerCase()) >= 0);
    const elemChildren = el.children.length;
    // 실제 줄 수 — Range의 getClientRects()는 줄이 아니라 인라인 상자 단위로 나온다.
    // 자식이 3개면 한 줄이어도 3개가 나오므로, top이 같은 것끼리 묶어 세야 한다.
    const lineCount = (n) => {
      const r = document.createRange();
      r.selectNodeContents(n);
      const tops = [...r.getClientRects()]
        .filter((x) => x.width > 0.5 && x.height > 0.5)
        .map((x) => x.top).sort((a, b) => a - b);
      if (!tops.length) return 0;
      const tol = Math.max(4, (parseFloat(cs.fontSize) || 12) * 0.6);
      let lines = 0, last = -Infinity;
      for (const t of tops) if (t - last > tol) { lines++; last = t; }
      return lines;
    };
    // 인라인 자식만 있으면 한 흐름이다. inline-block(배지·칩)은 독립 상자이므로 제외한다
    const inlineOnly = elemChildren > 0 && [...el.children].every((c) => {
      if (SKIP.has(c.tagName)) return true;
      const d = getComputedStyle(c).display;
      return d === 'inline';
    });

    let directText = '';
    if (isSelect) directText = el.selectedOptions[0]?.textContent.trim() ?? '';
    else if (isField) directText = (el.value || el.placeholder || '').trim();
    else if (elemChildren === 0) directText = el.textContent.trim();

    if (directText) {
      node.text = directText.slice(0, 300);
      node.textStyle = { size: cs.fontSize, weight: cs.fontWeight, color: paintRef(el, ['color'], cs.color), lineHeight: cs.lineHeight };
      // 원본에서 몇 줄로 그려졌는지 — 한 줄이면 재현 시 줄바꿈을 금지해야 라벨이 쪼개지지 않는다
      const rc = (isSelect || isField) ? 1 : lineCount(el);
      if (rc === 1) node.textStyle.lines = 1;
      // flex 컨테이너의 글자 자리만 실측해 싣는다.
      // 버튼·페이지네이션은 text-align이 아니라 flex(justify-content·align-items)로
      // 가운데 정렬하므로 CSS 정렬을 추론하면 왼쪽/위로 붙는다.
      // 그 밖의 경우는 패딩 기준 배치가 이미 정확하다 — 실측으로 바꾸면 서브픽셀만큼
      // 오히려 어긋난다(전체 픽셀 일치율이 내려간다).
      if (!isSelect && !isField && /flex/.test(cs.display)) {
        const tr = document.createRange();
        tr.selectNodeContents(el);
        const rs = [...tr.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
        if (rs.length) {
          const x1 = Math.min(...rs.map((v) => v.x)), y1 = Math.min(...rs.map((v) => v.y));
          const x2 = Math.max(...rs.map((v) => v.x + v.width)), y2 = Math.max(...rs.map((v) => v.y + v.height));
          node.textStyle.box = [x1 + scrollX, y1 + scrollY, x2 - x1, y2 - y1].map((v) => Math.round(v * 10) / 10);
        }
      }
      if (cs.whiteSpace && cs.whiteSpace.indexOf('nowrap') >= 0) node.textStyle.lines = 1;
      // 인라인 요소가 여러 줄에 걸치면 bbox가 합집합이라 첫 줄 위치가 틀린다.
      // 줄마다 실측 상자를 따로 싣는다
      if (rc > 1 && cs.display === 'inline' && elemChildren === 0 && el.firstChild?.nodeType === 3) {
        const boxes = splitLinesOf(el.firstChild);
        if (boxes.length > 1) node.lineBoxes = boxes;
      }
    } else if (inlineOnly) {
      // 텍스트를 이어 붙이며 각 조각이 어느 요소에서 왔는지 기록한다
      let acc = '';
      const spans = [];
      const visit = (n, styleEl) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            const t = c.textContent.replace(/\s+/g, ' ');
            if (!t) continue;
            const s = acc.length; acc += t;
            spans.push([s, acc.length, styleEl]);
          } else if (c.nodeType === 1 && !SKIP.has(c.tagName)) {
            visit(c, c);
          }
        }
      };
      visit(el, el);
      const lead = acc.length - acc.replace(/^\s+/, '').length;
      const full = acc.trim().slice(0, 300);
      if (full) {
        node.text = full;
        node.textStyle = { size: cs.fontSize, weight: cs.fontWeight, color: paintRef(el, ['color'], cs.color), lineHeight: cs.lineHeight };
        if (lineCount(el) === 1) node.textStyle.lines = 1;
        // 바탕 스타일과 다른 구간만 싣는다 (볼드·색 강조)
        const runs = [];
        for (const [s, e, se] of spans) {
          if (se === el) continue;
          const ns = Math.max(0, s - lead), ne = Math.min(full.length, e - lead);
          if (ne <= ns) continue;
          const scs = getComputedStyle(se);
          const r = { s: ns, e: ne };
          if (scs.fontWeight !== cs.fontWeight) r.weight = scs.fontWeight;
          if (scs.color !== cs.color) r.color = paintRef(se, ['color'], scs.color);
          if (r.weight || r.color) runs.push(r);
        }
        if (runs.length) node.runs = runs;
        node.inlineFlow = true;   // 자식 요소는 이 텍스트에 흡수됐다
      }
    } else if (elemChildren > 0) {
      // 자식 중 인라인이 아닌 것이 섞인 혼합 노드 (예: .kpi-sub = 직접 텍스트 + inline-flex 칩).
      // 흡수하면 칩의 상자가 사라지고, 버리면 직접 텍스트가 통째로 없어진다.
      // 직접 텍스트만 실측 위치와 함께 따로 싣는다. children에는 넣지 않는다 —
      // 콜아웃 알약의 형제 회피 계산이 이 트리를 쓰기 때문에 구조를 바꾸면 배치가 흔들린다.
      const runs = [];
      const rd = (v) => Math.round(v * 10) / 10;
      for (const cn of el.childNodes) {
        if (cn.nodeType !== 3 || !cn.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(cn);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
        if (!rects.length) continue;
        if (rects.length === 1) {
          const q = rects[0];
          runs.push({ text: cn.textContent.trim().slice(0, 200), lines: 1,
            bbox: [rd(q.x + scrollX), rd(q.y + scrollY), rd(q.width), rd(q.height)] });
          continue;
        }
        for (const b of splitLinesOf(cn)) runs.push(b);
      }
      if (runs.length) {
        node.textRuns = runs;
        node.textStyle = { size: cs.fontSize, weight: cs.fontWeight, color: paintRef(el, ['color'], cs.color), lineHeight: cs.lineHeight };
      }
    }
    // CSS 의사요소의 content는 DOM에 없어 그냥 두면 사라진다.
    // 필수 입력 표시 `.req::after{content:'*';color:var(--red)}`가 여기에 해당한다.
    const pseudo = (pe) => {
      const p = getComputedStyle(el, pe);
      const m = (p.content || '').match(/^["'](.*)["']$/);
      if (!m || !m[1].trim()) return null;
      return { text: m[1], color: p.color, weight: p.fontWeight };
    };
    const pb = pseudo('::before');
    const pa = pseudo('::after');
    // 자기 텍스트가 없는 요소(칩만 든 라벨 등)는 의사요소를 본문에 붙일 자리가 없다.
    // 요소 원점에 단독으로 두면 '*'가 라벨 왼쪽 끝에 찍힌다.
    // 의사요소는 인라인 내용의 끝에 붙으므로 마지막 인라인 상자 오른쪽에 놓는다.
    if (pa && node.text == null) {
      let best = null;
      for (const cn of el.childNodes) {
        let rects = [];
        if (cn.nodeType === 3 && cn.textContent.trim()) {
          const r = document.createRange(); r.selectNodeContents(cn); rects = [...r.getClientRects()];
        } else if (cn.nodeType === 1 && !SKIP.has(cn.tagName)) {
          rects = [cn.getBoundingClientRect()];
        }
        for (const q of rects) {
          if (!(q.width > 0 && q.height > 0)) continue;
          if (!best || q.bottom > best.bottom + 1 || (Math.abs(q.bottom - best.bottom) <= 1 && q.right > best.right)) best = q;
        }
      }
      if (best) {
        const fs = parseFloat(cs.fontSize) || 12;
        node.textRuns = node.textRuns ?? [];
        node.textRuns.push({
          text: pa.text, lines: 1, color: pa.color !== cs.color ? paintRef(el, ['color'], pa.color) : undefined,
          bbox: [Math.round((best.right + scrollX + 2) * 10) / 10, Math.round((best.top + scrollY) * 10) / 10,
            Math.round(fs * pa.text.length * 6) / 10, Math.round(best.height * 10) / 10],
        });
        node.textStyle = node.textStyle
          ?? { size: cs.fontSize, weight: cs.fontWeight, color: paintRef(el, ['color'], cs.color), lineHeight: cs.lineHeight };
      }
    } else if (pb || pa) {
      // textRuns 분기는 textStyle만 두고 text는 두지 않는다. textStyle 유무로 판단하면 안 된다
      if (node.text == null) {
        node.text = '';
        node.textStyle = node.textStyle
          ?? { size: cs.fontSize, weight: cs.fontWeight, color: paintRef(el, ['color'], cs.color), lineHeight: cs.lineHeight, lines: 1 };
      }
      node.runs = node.runs ?? [];
      if (pb) {
        // 앞에 붙이므로 기존 구간 인덱스를 그만큼 민다
        for (const r of node.runs) { r.s += pb.text.length; r.e += pb.text.length; }
        node.runs.unshift(pseudoRun(0, pb.text.length, pb, cs, el, paintRef));
        node.text = pb.text + node.text;
      }
      if (pa) {
        const s = node.text.length;
        node.text = node.text + pa.text;
        node.runs.push(pseudoRun(s, node.text.length, pa, cs, el, paintRef));
      }
      node.runs = node.runs.filter((r) => r.weight || r.color);
      if (!node.runs.length) delete node.runs;
    }
    if (node.textStyle) {
      // 네이티브 렌더에 필요한 배치 정보 — 표의 숫자 우측·상태 중앙 정렬이 여기에 달려 있다
      if (cs.textAlign && cs.textAlign !== 'start' && cs.textAlign !== 'left') node.textStyle.align = cs.textAlign;
      if (cs.letterSpacing && cs.letterSpacing !== 'normal') node.textStyle.letterSpacing = cs.letterSpacing;
    }
    if (parseFloat(cs.opacity) < 1) node.opacity = parseFloat(cs.opacity);
    if (cs.boxShadow && cs.boxShadow !== 'none') node.shadow = cs.boxShadow;
    const children = [];
    for (const c of el.children) { const n = walk(c, false); if (n) children.push(n); }
    if (children.length) node.children = children;
    return node;
  };

  // auxOnly 모드: 트리거로 열린 실제 상태에서 해당 부속 트리만 재측정 (bbox ↔ 스크린샷 정합)
  if (cfg.auxOnly) {
    const el = document.querySelector(`[data-uid-aux="${cfg.auxOnly}"]`);
    return el ? { auxTree: walk(el, true) } : { auxTree: null };
  }

  const tree = walk(document.body, false);

  // 부속 프레임 (숨김 상태) — 강제 표시 후 개별 추출. data-uid-aux로 고유 표식
  const auxFrames = [];
  const seen = new Set();
  const excludeIds = new Set(cfg.auxExcludeIds || []);
  for (const sel of cfg.auxSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue; seen.add(el);
      const preId = el.id || el.closest('[id]')?.id;
      if (preId && excludeIds.has(preId)) continue; // 프로토타입 헬퍼 등 보드화 제외
      const chain = [];
      let cur = el;
      while (cur && cur !== document.body) { // 조상 사슬 표시
        const cs = getComputedStyle(cur);
        if (cs.display === 'none') { chain.push([cur, cur.style.display]); cur.style.display = cur.matches(cfg.overlayFlexSelector) ? 'flex' : 'block'; }
        cur = cur.parentElement;
      }
      const id = el.id || el.closest('[id]')?.id || `aux_${auxFrames.length}`;
      el.setAttribute('data-uid-aux', id);
      auxFrames.push({ selector: `[data-uid-aux="${id}"]`, auxId: id, tree: walk(el, true) });
      for (const [n, d] of chain) n.style.display = d; // 복원
    }
  }

  const componentCandidates = Object.entries(sigCount)
    .filter(([, c]) => c >= cfg.minOccurrences)
    .map(([signature, count]) => ({ signature, count }))
    .sort((a, b) => b.count - a.count);

  const considered = stats.tokenRefs + stats.unresolved;
  return {
    tokens, tree, auxFrames, componentCandidates,
    stats: { ...stats, mappingRate: considered ? +(stats.tokenRefs / considered).toFixed(4) : 1 },
  };
};

const ir = await page.evaluate(extractFn, {
  auxSelectors: policy.extraction.auxFrameSelectors,
  auxExcludeIds: policy.extraction.auxExclude?.ids ?? [],
  minOccurrences: policy.componentPromotion.minOccurrences,
  overlayFlexSelector: DOM.overlayFlexSelector,
});

// ── 3a) 트리거 클릭으로 부속 프레임 실제 상태 재현 (JS 주입 데이터 포함) ──
// 강제 표시는 빈 컨테이너 상태를 찍으므로, 먼저 실제 트리거를 눌러 채워진 상태를 캡처한다.
// 관련도 순 그룹 — 앞 그룹일수록 모달 트리거 가능성이 높다 (DOM 계약에서 주입).
// 목록을 재렌더해 이후 트리거를 무력화하는 요소(새로고침 등)는 그룹에서 빼는 것이 정석이다.
const TRIGGER_GROUPS = DOM.triggerGroups;
const TRIGGER_SEL = TRIGGER_GROUPS.join(', ');
const captured = new Set();
const closeAll = async () => {
  await page.evaluate((D) => {
    for (const b of document.querySelectorAll(D.overlayContainers)) b.classList.remove(D.overlayOpenClass);
    document.body.style.overflow = '';
  }, DOM);
  await page.waitForTimeout(60);
};
// 드로어는 position:fixed라 offsetParent가 null이므로 크기·가시성 스타일로만 판정한다
const visibleAuxId = () => page.evaluate(() => {
  for (const el of document.querySelectorAll('[data-uid-aux]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    return el.getAttribute('data-uid-aux');
  }
  return null;
});

// 대상 프레임마다 신선한 페이지 상태에서 트리거를 탐색한다 (앞선 클릭이 목록·필터를 오염시키지 않게)
const retag = () => page.evaluate(({ sels, exIds, exPats }) => {
  const seen = new Set(); let i = 0;
  const pats = exPats.map((p) => new RegExp(p));
  for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
    if (seen.has(el)) continue; seen.add(el);
    const id = el.id || el.closest('[id]')?.id || `aux_${i++}`;
    if (exIds.includes(id) || pats.some((r) => r.test(id))) continue;
    el.setAttribute('data-uid-aux', id);
  }
}, {
  sels: policy.extraction.auxFrameSelectors,
  exIds: policy.extraction.auxExclude?.ids ?? [],
  exPats: policy.extraction.auxExclude?.patterns ?? [],
});

for (const aux of ir.auxFrames) {
  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
  await retag();
  let opened = false;
  let tried = 0;
  // 대상 전용 트리거를 먼저 시도한 뒤 일반 그룹으로 확장 (그룹당 상한을 둬 뒤 그룹도 기회를 갖게 한다)
  const named = DOM.namedTriggers.filter((t) => new RegExp(t.match, 'i').test(aux.auxId)).map((t) => t.selector);
  const groups = [`[data-modal-open="${aux.auxId}"]`, ...named, ...TRIGGER_GROUPS];
  for (const group of groups) {
    if (opened) break;
    const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, group);
    let inGroup = 0;
    for (let i = 0; i < n && !opened && tried < 90 && inGroup < 12; i++) {
      const clicked = await page.evaluate(({ sel, idx }) => {
        const el = document.querySelectorAll(sel)[idx];
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        el.click();
        return true;
      }, { sel: group, idx: i });
      if (!clicked) continue;
      tried++; inGroup++;
      await page.waitForTimeout(200);
      if (page.url() !== PAGE_URL_CANON) { // 링크 클릭으로 다른 화면으로 이동한 경우
        await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
        await retag();
        continue;
      }
      opened = (await visibleAuxId()) === aux.auxId;
      if (!opened) { await closeAll(); }
    }
  }
  // 페이지 폼 제출 경로: 필수 입력을 채우고 본문 기본 버튼을 눌러 확인 모달 진입 (등록/신청 화면)
  if (!opened) {
    await closeAll();
    const submits = await page.evaluate((sel) => document.querySelectorAll(sel).length, DOM.formSubmitSelectors);
    for (let i = 0; i < Math.min(submits, 6) && !opened; i++) {
      await page.evaluate(({ idx, root, submit }) => {
        for (const el of document.querySelectorAll(`${root} input[type=text], ${root} input:not([type]), ${root} textarea`)) {
          if (!el.value) { el.value = '검수용 임시 입력'; el.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        for (const el of document.querySelectorAll(`${root} input[type=checkbox]:not(:disabled)`)) {
          if (el.required && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        for (const el of document.querySelectorAll(`${root} select`)) el.dispatchEvent(new Event('change', { bubbles: true }));
        const b = document.querySelectorAll(submit)[idx];
        if (b && !b.disabled) b.click();
      }, { idx: i, root: DOM.contentRoot, submit: DOM.formSubmitSelectors });
      await page.waitForTimeout(250);
      opened = (await visibleAuxId()) === aux.auxId;
    }
    if (opened) aux.captureChain = 'form';
  }
  // 2단계 연쇄: 선행 모달을 연 뒤 기본 버튼(다음/확인)을 눌러 확인 단계로 진입
  if (!opened) {
    for (const group of TRIGGER_GROUPS.slice(0, 3)) {
      if (opened) break;
      const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, group);
      for (let i = 0; i < Math.min(n, 12) && !opened; i++) {
        await closeAll();
        const ok = await page.evaluate(({ sel, idx }) => {
          const el = document.querySelectorAll(sel)[idx];
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          el.click();
          return true;
        }, { sel: group, idx: i });
        if (!ok) continue;
        await page.waitForTimeout(180);
        // 열린 모달 안에서 필수 입력을 채우고 기본 버튼을 눌러 다음 단계로
        await page.evaluate((D) => {
          const open = [...document.querySelectorAll(D.overlayContainers)].find((b) => b.classList.contains(D.overlayOpenClass));
          if (!open) return;
          for (const el of open.querySelectorAll('input[type=checkbox]')) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
          for (const el of open.querySelectorAll('textarea, input[type=text]')) { el.value = el.value || '검수용 임시 입력'; el.dispatchEvent(new Event('input', { bubbles: true })); }
          const btn = [...open.querySelectorAll(D.primaryActionSelectors)].find((b) => !b.disabled);
          if (btn) btn.click();
        }, DOM);
        await page.waitForTimeout(220);
        opened = (await visibleAuxId()) === aux.auxId;
      }
    }
    if (opened) aux.captureChain = 2;
  }
  if (!opened) continue;
  const shot = path.join(screensDir, `${screenNo}__${aux.auxId}.png`);
  await page.evaluate(({ id, pat }) => { // 딤 제거 후 캡처
    const re = new RegExp(pat);
    const el = document.querySelector(`[data-uid-aux="${id}"]`);
    for (let c = el; c && c !== document.body; c = c.parentElement) {
      if (re.test(c.className)) c.style.background = '#fff';
    }
    el.scrollIntoView({ block: 'center' });
  }, { id: aux.auxId, pat: DOM.overlayNamePattern });
  await page.locator(`[data-uid-aux="${aux.auxId}"]`).screenshot({ path: shot });
  aux.screenshot = path.relative(WORK_ROOT, shot);
  aux.captureMode = 'trigger';
  // 트리로 잰 bbox는 강제 표시(빈) 상태 값이므로, 캡처와 같은 채워진 상태에서 재측정한다
  const remeasured = await page.evaluate(extractFn, {
    auxSelectors: policy.extraction.auxFrameSelectors,
    auxExcludeIds: policy.extraction.auxExclude?.ids ?? [],
    minOccurrences: policy.componentPromotion.minOccurrences,
    overlayFlexSelector: DOM.overlayFlexSelector,
    auxOnly: aux.auxId,
  });
  if (remeasured?.auxTree) { aux.tree = remeasured.auxTree; aux.treeState = 'trigger'; }
  captured.add(aux.auxId);
}
await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
await retag();

// ── 3b) 트리거로 열리지 않은 나머지: 강제 표시 폴백 ──
for (const aux of ir.auxFrames.filter((a) => !captured.has(a.auxId))) {
  aux.captureMode = 'forced';
  const shot = path.join(screensDir, `${screenNo}__${aux.auxId}.png`);
  const ok = await page.evaluate(({ sel, flexSel, pat }) => {
    const re = new RegExp(pat);
    const el = document.querySelector(sel); if (!el) return false;
    let cur = el;
    while (cur && cur !== document.body) {
      if (getComputedStyle(cur).display === 'none') {
        cur.setAttribute('data-uid-prev-display', cur.style.display || '');
        cur.style.display = cur.matches(flexSel) ? 'flex' : 'block';
      }
      // 라운드 코너 뒤로 딤 배경이 비치지 않게 캡처 동안 오버레이를 흰색으로
      if (re.test(cur.className)) {
        cur.setAttribute('data-uid-prev-bg', cur.style.background || '');
        cur.style.background = '#fff';
      }
      cur = cur.parentElement;
    }
    el.scrollIntoView({ block: 'center' });
    return true;
  }, { sel: aux.selector, flexSel: DOM.overlayFlexSelector, pat: DOM.overlayNamePattern });
  if (ok) {
    await page.locator(aux.selector).screenshot({ path: shot });
    aux.screenshot = path.relative(WORK_ROOT, shot);
  }
  await page.evaluate(() => { // 표시 상태 원복
    for (const n of document.querySelectorAll('[data-uid-prev-display]')) {
      n.style.display = n.getAttribute('data-uid-prev-display');
      n.removeAttribute('data-uid-prev-display');
    }
    for (const n of document.querySelectorAll('[data-uid-prev-bg]')) {
      n.style.background = n.getAttribute('data-uid-prev-bg');
      n.removeAttribute('data-uid-prev-bg');
    }
  });
}

await browser.close();

writeJson(outFile, {
  screen: screenNo,
  sourceFile: path.basename(args.html),
  extractedAt: new Date().toISOString(),
  viewport: 1400,
  screenshot: path.relative(WORK_ROOT, mainShot),
  mainCrop: mainCropBBox ? { screenshot: path.relative(WORK_ROOT, mainCropShot), bbox: mainCropBBox } : null,
  consoleErrors, requestFailures,
  stripped, // 제거된 프로토타입 전용 블록 수 (검증용)
  ...ir,
});
console.log(`IR 저장: ${outFile}`);
console.log(`노드 ${ir.stats.nodes} · 토큰참조 ${ir.stats.tokenRefs} · 미해결 ${ir.stats.unresolved} · 매핑률 ${(ir.stats.mappingRate * 100).toFixed(1)}%`);
console.log(`부속 프레임 ${ir.auxFrames.length}건 · 컴포넌트 후보 ${ir.componentCandidates.length}건`);
if (consoleErrors.length) console.warn('콘솔 오류:', consoleErrors);
if (requestFailures.length) console.warn('요청 실패/차단:', requestFailures);
