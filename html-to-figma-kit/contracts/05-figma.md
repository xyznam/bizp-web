# 05. Figma 반영 계약

**구현: `engine/` + `engine/plugin/` 그대로.** 번들 스키마에만 의존하므로 화면군과 무관하다.

## 순서

```bash
# 1. 보드 조립
node <키트>/engine/scripts/build_board.mjs \
  --manifest output/manifest.json --screen 01 --out output/boards-html/01.html

# 2. 캡처 + 검증 + placement
node <키트>/engine/scripts/capture_boards.mjs \
  --html output/boards-html/01.html --output output/boards \
  --report output/reports --placement output/placements/01.json \
  --gap 120 --expected-width 1920

# 3. General 표 열 너비 실측 (General 보드가 있을 때만)
node <키트>/engine/scripts/measure_tables.mjs \
  --html output/boards-html/general.html --out output/general/_colwidths.json

# 4. placement 병합 (전 화면 캡처 후 1회)
node <키트>/engine/scripts/merge_placements.mjs \
  --manifest output/manifest.json --parts output/placements \
  --out output/boards/figma-placement.json

# 5. 번들 생성
node <키트>/engine/scripts/build_figma_bundle.mjs \
  --manifest output/manifest.json --out output/figma/bundle.json

# 6. 픽셀 대조 검증
node <키트>/engine/scripts/verify_render_tree.mjs \
  --bundle output/figma/bundle.json --out output/reports/render-verify
```

## 캡처 통과 조건

```
□ 보드 폭이 --expected-width 와 정확히 일치 (가로 오버플로 0)
□ 세로 오버플로 0
□ 콜아웃 번호 ↔ 디스크립션 Num 1:1, 빈 행 0
□ 콜아웃 대상 미발견 0
□ 레이어명·DOM ID 중복 0
□ 자산 요청 실패 0 · 콘솔 예외 0
□ figma-placement.json 의 좌표가 누적 규칙과 일치, 고유 파일명·레이어명
```

**`--report`를 반드시 준다.** 리포트 경로를 고정한 구현은 실행할 때마다 남의 리포트를 덮어쓴다(admin v3에서 실제로 발생한 결함).

## 번들 스키마

```jsonc
{
  "generatedAt": "…",
  "gap": 120,
  "layout": { /* 정책의 board 전량 */ },
  "colors": { /* 정책의 colors 전량 */ },
  "naming": { /* 정책의 naming 전량 — 플러그인이 페이지명에 쓴다 */ },
  "boards": [
    {
      "name": "01_회원현황", "screenId": "…", "chapter": "…", "cases": ["…"],
      "application": "Web Admin", "comment": "…"|null,
      "x": 0, "y": 0, "width": 1920, "height": 2400,
      "headerHeight": 68, "kind": "screen"|"general",
      "design": { "image": "01.png", … }|null,
      "callouts": [ … ], "rows": [ … ], "flags": [ … ]
    }
  ]
}
```

**플러그인에 프로젝트명을 하드코딩하지 않는다.** 화면군 이름은 `naming.projectLabel`로 번들에 실려 온다.

## 픽셀 대조

`verify_render_tree.mjs`가 번들에서 보드를 재현해 원본 스크린샷과 대조한다.

**기준선은 프로젝트마다 정한다.** admin-v3는 188보드 전량 평균 **98.0%**였다. 새 화면군의 첫 파일럿에서 나온 값이 그 프로젝트의 기준선이 되고, 이후 이보다 눈에 띄게 낮아지면 원인을 규명하고 진행하지 않는다.

낮은 값의 흔한 원인: 폰트 폴백(Pretendard 미설치), 브라우저 네이티브 위젯 문구(`controls.fileInput`), 인라인 요소 줄바꿈, 점선 테두리.

## Figma 반영

**1순위 — 로컬 플러그인 (네이티브·편집 가능).** Figma 데스크톱 → `Plugins → Development → Import plugin from manifest…`로 `engine/plugin/manifest.json`을 로드.

1. `tokens` → Figma **Variables** 컬렉션
2. `componentCandidates` 중 임계값 이상 → **Component** (+수식 클래스는 Variant 축)
3. 화면 트리 → Auto Layout 프레임 (`unresolved`는 고정값)
4. 보드 골격 → 헤더 2행·디스크립션 표(네이티브 텍스트)·콜아웃(칩·브래킷 벡터)
5. 배치 — 번들이 계위 좌표를 싣고 플러그인이 좌상단을 (0,0)으로 평행이동한다. **신규분만 실행해도 배치가 어긋나지 않는다**

**2순위 — PNG 폴백.** 플러그인 실행 불가·부정확 시 검증된 PNG를 `figma-placement.json` 좌표대로 배치. 이 경우 결과물이 **편집 불가 이미지 레이어**임을 반드시 명시한다.

## 기존 페이지 보호

1. 대상 파일·현재 UID 페이지 확인
2. 기존 페이지를 `{naming.backupPage}`로 백업(이름 변경 또는 복제)
3. 새 페이지에 생성 — **백업은 삭제하지 않는다**
4. 무관한 페이지·컴포넌트·스타일은 건드리지 않는다

## 완료 검증

```
□ 최상위 레이어 수 = 보드 수
□ 레이어명·좌표·크기 = placement와 일치 (붙여넣기 중 스케일 변화 = 실패)
□ 첫·마지막·최장 보드와 중간 2개를 PNG와 시각 대조
□ 네이티브 경로: Variables 바인딩 표본 확인 (색 1건을 바꿔 전 화면 반영 테스트)
□ 백업 페이지 존재·무변경
```

## 인도 시 고지

대상 파일, 새 페이지명, 백업명, 보드 수, **네이티브인지 PNG인지**(PNG면 사유), 산출물 경로, 추론으로 채운 범위, 원본 무수정 사실.
