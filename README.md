# Pamus Grit v2 - v18.3.7.4

## 관리자 업무현황 로딩 수정

원인:
실제 students 테이블에는 `status` 컬럼이 없는데 일부 API가
`status = 재원` 조건을 사용하고 있었습니다.

수정:
- work-today에서 잘못된 students.status 조건 제거
- today API 동일 조건 제거
- 정규 수업 상세 API 동일 조건 제거
- 추가수업 상세 API 동일 조건 제거

## 업무현황 추가수업 연동

관리자/선생님 업무현황에서 이제:
- 정규수업
- 주간에서 +수업추가로 만든 당일 추가수업

둘 다 업무로 계산합니다.

추가수업도:
- 진도 작성 여부
- 숙제 작성 여부
- 출결 완료 여부
를 makeup_lesson_records / makeup_attendance 기준으로 계산합니다.

SQL 추가 없음.
단, 18.3.6 SQL은 이미 실행되어 있어야 합니다.
