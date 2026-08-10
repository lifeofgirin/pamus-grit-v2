# Pamus Grit v2 - v10.2

## 학생관리 실제 DB 스키마 연결 수정

실제 students 컬럼에 맞춤:
- id
- student_name
- school
- registered_grade
- registered_school_year
- birth_date
- class_id

수정:
- 존재하지 않는 student_code 조회/저장 제거
- 상태(status) 기능은 실제 컬럼 확인 전 제거
- 등록연도 표시/수정 추가
- 학생목록 조회 정상화
- 학생 추가/수정/반 변경 유지

추가 SQL 없음.
