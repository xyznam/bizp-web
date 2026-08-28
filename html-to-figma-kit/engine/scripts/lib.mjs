// 공용 헬퍼 — 인자 파싱·정책 로드·경로 해석·Playwright 기동(원격 차단)
//
// 경로 모델 (원본 html-to-figma와 다른 점)
//   원본은 모든 경로를 스킬 폴더(html-to-figma/) 기준으로 풀었다. 키트는 스킬 폴더가
//   아니라 **작업 디렉터리(WORK_ROOT)** 기준으로 푼다. 키트 자체는 읽기 전용 도구이고
//   산출물은 작업자의 워크스페이스에 쌓이기 때문이다.
//
//   WORK_ROOT   기본값 = process.cwd(). 환경변수 UID_WORK_ROOT로 고정 가능
//   매니페스트 내부 경로(ir/descriptions/general)는 **매니페스트 파일 위치 기준** 상대경로
//   IR 내부 스크린샷 경로는 **WORK_ROOT 기준** 상대경로
//   절대경로는 어디서든 그대로 통과
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WORK_ROOT = path.resolve(process.env.UID_WORK_ROOT || process.cwd());

export function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const m = argv[i].match(/^--([a-z-]+)$/);
    if (m) { out[m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; }
  }
  return out;
}

// WORK_ROOT 기준 해석 (절대경로는 통과)
export const wr = (p) => path.resolve(WORK_ROOT, p);

// 기준 파일이 있는 디렉터리 기준 해석 — 매니페스트가 가리키는 경로에 쓴다
export const relTo = (baseFile, p) => path.resolve(path.dirname(path.resolve(baseFile)), p);

/**
 * 정책 로드 — 탐색 순서
 *   1. --policy 인자
 *   2. 환경변수 UID_BOARD_POLICY
 *   3. WORK_ROOT부터 위로 올라가며 board-policy.json 탐색
 * 키트는 정책 파일을 동봉하지 않는다. adapters/board-policy.template.json을 채워 쓴다.
 */
export function loadPolicy(p) {
  const explicit = p || process.env.UID_BOARD_POLICY;
  if (explicit) return readPolicy(path.resolve(explicit));
  let dir = WORK_ROOT;
  for (let i = 0; i < 8; i++) {
    const cand = path.join(dir, 'board-policy.json');
    if (fs.existsSync(cand)) return readPolicy(cand);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'board-policy.json을 찾지 못했습니다. --policy <경로>로 지정하거나 작업 디렉터리에 두십시오.\n'
    + `템플릿: ${path.join(KIT_ROOT, 'adapters', 'board-policy.template.json')}`,
  );
}

function readPolicy(file) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  policy.$file = file;
  return policy;
}

// 정책 필수 필드 확인 — 어댑팅 누락을 조용히 넘기지 않는다
export function requirePolicy(policy, dottedPaths) {
  const missing = dottedPaths.filter((k) => k.split('.').reduce((o, s) => (o == null ? o : o[s]), policy) === undefined);
  if (missing.length) {
    throw new Error(`정책 필드 누락 (${policy.$file}):\n  ${missing.join('\n  ')}\n`
      + 'ADAPTATION.md의 진단표를 채우십시오.');
  }
}

/**
 * Playwright 로드 — 탐색 순서
 *   1. 환경변수 UID_PLAYWRIGHT_DIR (node_modules를 담은 디렉터리)
 *   2. WORK_ROOT부터 위로 올라가며 node_modules/playwright 탐색
 *   3. 기본 require 해석 (전역/키트 설치분)
 */
export async function getPlaywright() {
  const tried = [];
  const attempt = (base) => {
    tried.push(base);
    try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { return null; }
  };
  if (process.env.UID_PLAYWRIGHT_DIR) {
    const m = attempt(path.resolve(process.env.UID_PLAYWRIGHT_DIR));
    if (m) return m;
  }
  let dir = WORK_ROOT;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'node_modules', 'playwright'))) {
      const m = attempt(dir);
      if (m) return m;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const m = attempt(KIT_ROOT);
  if (m) return m;
  throw new Error(`playwright를 찾지 못했습니다 (탐색: ${tried.join(', ')}).\n`
    + 'npm i playwright 후 UID_PLAYWRIGHT_DIR로 위치를 지정하거나 작업 디렉터리에 설치하십시오.');
}

// 원격 차단 컨텍스트: file:// 와 정책이 허용한 호스트만 통과
export async function launchPage(policy, { viewport = { width: 1400, height: 900 } } = {}) {
  const { chromium } = await getPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const allowed = new Set(policy.extraction?.allowedRemoteHosts || []);
  const failures = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:')) return route.continue();
    try {
      const host = new URL(url).hostname;
      if (allowed.has(host)) return route.continue();
    } catch { /* fallthrough */ }
    failures.push({ url, blocked: true });
    return route.abort();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText || '';
    if (!f.includes('ERR_ABORTED')) failures.push({ url: r.url(), error: f });
  });
  return { browser, page, consoleErrors, requestFailures: failures };
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

export function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
