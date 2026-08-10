# Pamus Grit v2 - v7.1

## 반별 진도/숙제 요약 수정
문제:
- 반별 요약이 lesson_records.class_id로 기록을 찾고 있었음
- 예전에 저장된 일부 lesson_records의 class_id가 비어 있으면 요약에서 누락됨

수정:
- 선택한 반의 schedules를 먼저 조회
- 해당 schedules의 id 전체로 lesson_records 조회
- 기존 작성 기록도 반별 요약에 표시 가능
- 관리자/선생님 반별 요약 모두 동일하게 수정

기존 v7 오늘 업무 대시보드 포함.
추가 SQL 없음.
