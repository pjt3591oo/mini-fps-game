# FPS Arena

브라우저에서 돌아가는 웨이브 서바이벌 FPS (Three.js + Node WebSocket 서버).

## 실행

```
npm install
npm start
```

브라우저에서 http://localhost:3000 을 엽니다. 같은 네트워크의 다른 사람은 `http://<내 IP>:3000` 으로 접속해 같은 방 이름으로 **협동 참가**를 누르면 됩니다.

## 조작

| 키 | 동작 |
| --- | --- |
| WASD / Shift / Space / C | 이동 / 달리기 / 점프 / 앉기 |
| Q | 대시 (잠깐 무적, 2.5초 대기) |
| 좌클릭 / 우클릭 | 사격 / 정조준 (저격총은 조준경) |
| 1~5, 휠, E | 무기 교체 (소총·샷건·저격총·권총, 5번 로켓은 보급품으로 획득) |
| R / G | 재장전 / 수류탄 |
| 1·2·3, R (웨이브 클리어 후) | 특성 선택, 다시 뽑기 |
| V, 휠 클릭 | 위치 표시 |
| F (길게) | 쓰러진 동료 부활 (협동) |
| B (웨이브 사이) | 상점: 무기 강화, 아이템·보급 구매 |
| Z / X / T | 구급 주사 / 방어막 / 폭격 요청 (상점에서 산 아이템). T는 누르고 있으면 범위가 보이고 떼면 요청 |
| Enter | 다음 웨이브 바로 시작 |

## 게임 요소

- 적 7종 + 보스 2종(5웨이브마다 보스, 10웨이브마다 포격대장). 6웨이브부터 벽 뒤에서 곡사로 쏘는 척탄병 등장
- 크레딧과 상점: 무기 강화(+7까지, 확률제 또는 확정, +5·+7은 무기별 고유 효과), 소모 아이템 3종, 로켓 발사기, 특성 개입권(다시 뽑기·희귀 보장)
- 웨이브 변이 7종, 특성 13종(희귀 5종), 보급품 투하, 드럼통, 난이도 3단계
- 맵 2종(요새 광장, 창고 지구), 협동 플레이, 서버 순위표

- 메뉴의 **그래픽** 설정: 높음(빛 번짐·색 보정) / 낮음(성능 우선)

## 애셋

무기·적·맵 소품·텍스처·효과음은 `public/assets/`의 CC0 애셋을 씁니다. 출처는 `public/assets/CREDITS.md`에 있습니다.

- 무기 1인칭 모델: Quaternius 총기 4종 + CreativeTrio 로켓 발사기. 기존 상자 모델과 같은 자리(총구·가늠자 높이)에 맞춰 넣어 정조준 위치는 그대로입니다
- 적: Quaternius SWAT 캐릭터(걷기·달리기·조준·사격·주먹·피격·사망 애니메이션). 종류별 색은 옷 색으로, 공격 예고는 고글 발광으로 보입니다. 사격 판정은 이전처럼 보이지 않는 기본 도형이 맡습니다
- 맵: Poly Haven 재질(색·노멀·거칠기 맵), 반사용 HDRI, 폭발 드럼통 모델
- 효과음: 실총 녹음(AR-15, Benelli Nova, Tikka T3, Walther PPQ), 재장전·펌프, 발소리, 탄착음, 폭발. 멀리서 난 소리는 고음을 깎고 잔향을 더합니다

애셋 파일을 못 받으면 각 모듈이 이전의 절차적 애셋(상자 총기, 캔버스 텍스처, 합성음)으로 대신합니다.

기획 의도와 사이클별 검토 기록은 `docs/PLAN.md`에 있습니다.

## 기획팀

`.claude/agents/`에 역할별 기획자(시스템·레벨·밸런스·UX)가 정의돼 있습니다. Claude Code에서 `/planning-meeting [주제]`를 실행하면 네 명이 동시에 기획안을 `docs/planning/cycle-N/`에 쓰고, 총괄이 채택·보류를 정해 `docs/PLAN.md`에 기록합니다. 사람이 플레이한 판은 `data/runs.jsonl`에 사망 원인·보급품 사용 등이 쌓여 다음 회의의 근거가 됩니다.

## 구조

- `server.js` — 정적 파일 제공 + WebSocket 릴레이(방, 호스트 선출/이전)
- `public/maps/*.json` — 맵 정의 (상자, 계단, 드럼통, 스폰 지점, 척탄병 포대 지점 `perches`, glTF 모델). 새 맵은 `main.js`의 `MAPS`와 `index.html`의 맵 선택 목록에 등록
- `data/scores.json` — 순위표 (서버가 자동 생성)
- `public/js/`
  - `config.js` 무기·적·픽업 수치 (밸런스는 여기서 조정)
  - `world.js` 맵 로딩, 충돌, 이동 · `nav.js` 적 길찾기(격자 거리장)
  - `player.js` · `weapons.js` · `enemies.js`(AI, 투사체, 웨이브, 폭발) · `perks.js` · `shop.js`(크레딧, 아이템, 강화, 상점)
  - `net.js` 멀티플레이 · `hud.js` · `effects.js` · `audio.js` · `main.js`
  - `engine.js` 렌더러·조명·후처리 · `textures.js` 절차적 텍스처 · `icons.js` 화면용 그림(SVG)
  - `assets.js` 외부 애셋 로더(모델·재질·환경광·효과음) · `enemyLook.js` 적 캐릭터 모델과 애니메이션

## 맵 편집

`arena.json`의 `objects`에 항목을 추가합니다.

```json
{ "type": "box", "pos": [x, z], "size": [가로, 높이, 세로], "y": 0, "mat": "crate", "mirror": "xz" }
{ "type": "stairs", "edge": [x, z], "dir": [1, 0], "width": 4, "steps": 3, "stepH": 0.5, "stepD": 1.1 }
```

glTF 모델은 `public/assets/`에 넣고 `models`에 등록하거나, 게임 화면에 `.glb` 파일을 끌어다 놓으면 됩니다.

```json
"models": [{ "url": "assets/tower.glb", "position": [10, 0, 10], "scale": 1, "collide": true }]
```

맵은 겹쳐진 층(다리 밑 통로 등)이 없다는 전제로 길찾기가 동작합니다.

## 멀티플레이 방식

방에 처음 들어온 사람이 호스트가 되어 적·웨이브를 시뮬레이션하고, 나머지는 상태를 받아 표시합니다. 호스트가 나가면 다음 사람에게 넘어갑니다. 호스트의 브라우저 탭이 백그라운드로 가면 적이 멈추니 탭을 띄워 두세요.

## 테스트

`http://localhost:3000/?debug` 로 열고 콘솔에서 `__bot = true` 를 입력하면 봇이 대신 플레이합니다 (`__botSkill = 0~1`).

서버를 켠 상태에서 헤드리스 Chrome으로 자동 플레이테스트를 돌릴 수 있습니다.

```
node tools/playtest.js balance 600     # 숙련도별 봇이 어느 웨이브까지 가는지
node tools/playtest.js coop 40         # 2인 협동 동기화, 호스트 이전
node tools/playtest.js run 시나리오.js  # 임의 스크립트를 게임 안에서 실행
node tools/test-coop-systems.js        # 협동: 지원 수당, 예고 원 동기화, 상점
node tools/test-pointer-lock.js        # 실제 마우스 잠금으로 상점·일시정지 흐름
node tools/test-pointer-lock-fail.js   # 잠금이 거부·무시될 때의 복구
```

주소에 `?expose`를 붙이면 마우스 잠금 등 실제 동작은 그대로 두고 게임 상태만 `window.__game`으로 노출합니다(자동 테스트용).
