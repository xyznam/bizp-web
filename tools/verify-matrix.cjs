#!/usr/bin/env node
/* ============================================================
   verify-matrix.js — 화면 ↔ capability-matrix 정합 검사 (정적)
   실행: node tools/verify-matrix.cjs   (저장소 루트에서)

   검사 8종
   1 HTML 파일이 매트릭스에 등재됐는가
   2 body data-screen 이 매트릭스 키와 일치하는가
   3 등재 모듈이 HTML 에 data-module 로 붙어 있는가
   4 HTML 의 data-module 이 매트릭스에 등재됐는가
   5 data-copy 키가 UW_COPY 에 있는가
   6 모듈 perm 이 UW_PERMS.catalog 에 있는가
   7 L3 LNB 그룹이 모든 셸 화면에서 동일한가
   8 .uw-lvl-switch 안에 data-level-btn 없는 버튼이 섞여 있는지 (레벨 오염 주의)
   ============================================================ */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["index.html"]);
const isSkipped = f => SKIP.has(f) || f.includes("디자인 가이드");

global.window = {};
require(path.join(ROOT, "assets/capability-matrix.js"));
const { UW_MATRIX: M, UW_COPY: COPY = {}, UW_PERMS: PERMS = { catalog: {} } } = global.window;

const htmls = fs.readdirSync(ROOT).filter(f => f.endsWith(".html") && !isSkipped(f)).sort();
const byFile = {}; for (const k in M) byFile[M[k].file] = [k, M[k]];
const problems = [];
const bad = (...a) => problems.push(a.join(" "));

for (const f of htmls) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (!byFile[f]) { bad("[1]", f, "매트릭스 미등재"); continue; }
  const [id, sc] = byFile[f];

  const ds = src.match(/<body[^>]*data-screen="([^"]+)"/);
  if (!ds) bad("[2]", f, "body data-screen 없음");
  else if (ds[1] !== id) bad("[2]", f, `data-screen=${ds[1]} ≠ 매트릭스 키 ${id}`);

  const found = new Set([...src.matchAll(/data-module="([^"]+)"/g)].map(m => m[1]));
  const reg = Object.keys(sc.modules || {});
  reg.filter(m => !found.has(m)).forEach(m => bad("[3]", id, f, `등재됐으나 HTML 에 없음: ${m}`));
  [...found].filter(m => !reg.includes(m)).forEach(m => bad("[4]", id, f, `HTML 에 있으나 미등재: ${m}`));

  for (const m of src.matchAll(/data-copy="([^"]+)"/g))
    if (!((COPY[id] || {})[m[1]])) bad("[5]", id, f, `카피 매트릭스 미등재 키: ${m[1]}`);

  for (const [mid, mod] of Object.entries(sc.modules || {}))
    if (mod.perm && !PERMS.catalog[mod.perm]) bad("[6]", id, mid, `알 수 없는 perm: ${mod.perm}`);

  for (const blk of src.matchAll(/<div class="uw-lvl-switch"[^>]*>([\s\S]*?)<\/div>/g)) {
    const btns = [...blk[1].matchAll(/<button[^>]*>/g)].map(b => b[0]);
    const mixed = btns.some(b => b.includes("data-level-btn")) && btns.some(b => !b.includes("data-level-btn"));
    if (mixed) bad("[8]", f, "한 .uw-lvl-switch 안에 레벨 버튼과 비레벨 버튼이 섞여 있다");
  }
}

const sigs = {};
for (const f of htmls) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (!src.includes('class="uw-lnb"')) continue;
  const m = src.match(/<nav class="uw-menu" data-only-level="L3">([\s\S]*?)<\/nav>/);
  const key = m ? [...m[1].matchAll(/href="([^"]+)"/g)].map(x => x[1]).join("|") : "(L3 그룹 없음)";
  (sigs[key] = sigs[key] || []).push(f);
}
const keys = Object.keys(sigs);
if (keys.length > 1) {
  bad("[7]", `L3 LNB 그룹이 ${keys.length}종으로 갈렸다`);
  keys.forEach(k => bad("     ", k, "→", sigs[k].join(", ")));
}

console.log(`화면 ${htmls.length} · 등재 ${Object.keys(M).length}`);
if (problems.length) { problems.forEach(p => console.log("⚠", p)); console.log(`\n❌ ${problems.length}건`); process.exit(1); }
console.log("✅ 검사 8종 전부 통과");
