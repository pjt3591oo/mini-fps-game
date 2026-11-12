---
description: 기획팀 회의를 열어 다음 사이클 기획안을 모으고 채택안을 정한다
---

FPS Arena 기획 회의를 연다. 주제: $ARGUMENTS (비어 있으면 `docs/PLAN.md` 끝의 "다음 사이클 후보"와 미검증 항목에서 고른다)

1. `docs/PLAN.md`에서 마지막 사이클 번호를 확인하고 `docs/planning/cycle-N/` 폴더를 만든다.
2. 기획자 네 명(system-designer, level-designer, balance-designer, ux-designer)을 **동시에** 호출한다. 각자에게 주제와 기획안을 쓸 경로(`docs/planning/cycle-N/<역할>.md`)를 알려 준다. 봇 테스트는 balance-designer만 돌린다.
3. 네 기획안을 모두 읽고 총괄 기획자로서 판정한다: 가치·비용·위험으로 비교하고, 안끼리 충돌하거나 겹치는 부분을 정리한다. 근거가 약한 안은 코드를 직접 확인해 걸러낸다.
4. `docs/PLAN.md`에 새 사이클을 기존 형식(진단 / 후보와 타당성 표 / 결과)으로 덧붙이고, 채택·보류·기각 사유를 적는다.
5. 채택안과 보류 사유를 사용자에게 요약해 보고한다. 개발은 사용자가 진행을 요청했거나 이미 자율 개발을 맡긴 경우에만 이어서 한다.
