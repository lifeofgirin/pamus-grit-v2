# Pamus Grit v2 - v7.2

## 주간 날짜 계산 수정

원인:
- YYYY-MM-DD를 `+09:00` 시각으로 만든 뒤 `getDay()`를 사용해
  Vercel/Node의 UTC 기준에서 하루 전 요일로 해석될 수 있었음.
- 2026-08-10 월요일이 일요일처럼 계산되어
  주간 시작이 2026-08-04처럼 잘못 잡히는 현상이 발생.

수정:
- 날짜를 "시각"이 아니라 순수 YYYY-MM-DD 달력 날짜로 처리
- Date.UTC + getUTCDay / getUTCDate 사용
- /api/week 수정
- /api/admin/class-week 수정
- 프론트 지난주/다음주 이동 함수도 UTC 방식으로 수정

정상 기대값:
- 2026-08-10 기준 이번 주 = 2026-08-10 ~ 2026-08-14
- 2026-08-10 lesson_records의 진도/숙제가 해당 주 요약에 표시

추가 SQL 없음.
