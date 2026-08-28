#!/usr/bin/env python3
"""admin-v3-launch-spec → admin-v3-static
각 화면을 외부 파일 의존이 없는 단일 정적 HTML로 변환한다.

변환 내용
  1) assets/admin-system.css  → <style> 인라인
  2) assets/lnb-data.js       → <script> 인라인 (admin-system.js보다 먼저)
  3) assets/admin-system.js   → <script> 인라인
  4) LNB를 마크업에 미리 렌더(JS가 innerHTML로 덮어쓰므로 무해) — JS 미실행 환경 대비
  5) 스냅샷 주석 삽입

유지: 화면 간 링크(상대 경로 .html), 모든 인터랙션(모달·필터·드로어)
"""
import json, os, re, shutil, sys, datetime

SRC = '/Users/1004182/Documents/260629New project/bizp-admin-planning-work/prototype/admin-v3-launch-spec'
DST = '/Users/1004182/Documents/260629New project/bizp-admin-planning-work/prototype/admin-v3-static'
STAMP = '2026-07-24'

css = open(os.path.join(SRC, 'assets/admin-system.css'), encoding='utf-8').read()
lnb = open(os.path.join(SRC, 'assets/lnb-data.js'), encoding='utf-8').read()
sysjs = open(os.path.join(SRC, 'assets/admin-system.js'), encoding='utf-8').read()

# 인라인 시 파서가 조기 종료되지 않도록 종료 태그 이스케이프
esc_js = lambda s: s.replace('</script>', '<\\/script>')
esc_css = lambda s: s.replace('</style>', '<\\/style>')

# ── LNB 사전 렌더 (admin-system.js의 렌더 로직과 동일 규격) ──
m = re.search(r'window\.BIZP_LNB\s*=\s*(\{.*\});', lnb, re.S)
DATA = json.loads(m.group(1))

def lnb_html(current):
    out = ['<div class="sb-logo">' + DATA['brand'] + '</div>']
    for g in DATA['groups']:
        proto = ' sb-proto' if g.get('proto') else ''
        out.append('<div class="sb-section%s">%s</div>' % (proto, g['label']))
        for it in g['items']:
            active = ' active' if it['file'] == current else ''
            out.append('<div class="sb-item%s%s"><span class="si"></span><a href="%s">%s</a></div>'
                       % (proto, active, it['file'], it['label']))
    return ''.join(out)

# 산출물(.html)만 교체 — README.md·tools/ 등 폴더 내 수기 자산은 보존
os.makedirs(DST, exist_ok=True)
for old_html in [x for x in os.listdir(DST) if x.endswith('.html')]:
    os.remove(os.path.join(DST, old_html))

files = sorted(f for f in os.listdir(SRC) if f.endswith('.html'))
report = []

for f in files:
    s = open(os.path.join(SRC, f), encoding='utf-8').read()
    orig = len(s)
    hits = {'css': 0, 'lnb': 0, 'sys': 0, 'aside': 0}

    # 1) CSS
    def css_sub(mo):
        hits['css'] += 1
        return '<style>\n/* ── assets/admin-system.css (인라인, %s 스냅샷) ── */\n%s\n</style>' % (STAMP, esc_css(css))
    s = re.sub(r'<link[^>]*admin-system\.css[^>]*>', css_sub, s, count=1)

    # 2) lnb-data.js
    def lnb_sub(mo):
        hits['lnb'] += 1
        return '<script>\n/* ── assets/lnb-data.js (인라인) ── */\n%s\n</script>' % esc_js(lnb)
    s = re.sub(r'<script[^>]*src="assets/lnb-data\.js[^"]*"[^>]*>\s*</script>', lnb_sub, s, count=1)

    # 3) admin-system.js
    def sys_sub(mo):
        hits['sys'] += 1
        return '<script>\n/* ── assets/admin-system.js (인라인) ── */\n%s\n</script>' % esc_js(sysjs)
    s = re.sub(r'<script[^>]*src="assets/admin-system\.js[^"]*"[^>]*>\s*</script>', sys_sub, s, count=1)

    # 4) LNB 사전 렌더
    def aside_sub(mo):
        hits['aside'] += 1
        return mo.group(1) + lnb_html(f) + '</aside>'
    # 내부가 주석·공백뿐인 빈 aside만 대상 (JS가 innerHTML로 덮어쓰므로 무해한 폴백)
    s = re.sub(r'(<aside class="sidebar"[^>]*>)((?:\s|<!--.*?-->)*)</aside>', aside_sub, s, count=1, flags=re.S)

    # 5) 스냅샷 주석
    s = s.replace('<head>',
        '<head>\n<!-- BizPlanet Admin v3 — 정적 스냅샷 %s · 원본: prototype/admin-v3-launch-spec/%s\n'
        '     공통 CSS·JS를 인라인해 외부 파일 의존이 없습니다(단일 파일로 열림).\n'
        '     본문 편집은 원본에서 하고 이 폴더는 tools/build_static.py로 재생성합니다. -->' % (STAMP, f), 1)

    open(os.path.join(DST, f), 'w', encoding='utf-8').write(s)
    report.append((f, hits, orig, len(s)))

# 리포트
NO_SHELL = {'qa_렌더링검증.html'}  # iframe 하네스 — 공통 LNB/JS 미사용
miss = [(f, h) for f, h, _, _ in report if f not in NO_SHELL and not (h['css'] and h['lnb'] and h['sys'])]
print('변환 %d개 파일 → %s' % (len(report), DST))
print('  CSS 인라인 %d / LNB 데이터 %d / 공통 JS %d / LNB 사전렌더 %d'
      % tuple(sum(h[k] for _, h, _, _ in report) for k in ('css', 'lnb', 'sys', 'aside')))
if miss:
    print('  ⚠ 누락:', miss)
total = sum(n for _, _, _, n in report)
print('  총 용량 %.1f MB (평균 %.0f KB/파일)' % (total / 1e6, total / len(report) / 1024))
