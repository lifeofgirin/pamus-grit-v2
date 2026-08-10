# Pamus Grit v2 - v10.1

## 학생관리 TypeScript 빌드 오류 수정

원인:
- 첫 students 조회는 birth_date 포함
- fallback 조회는 birth_date 미포함
- TypeScript가 첫 조회 결과 타입으로 result를 고정해
  fallback 결과를 재할당할 수 없다고 판단

수정:
- fallback을 허용하도록 result 응답 타입을 유연하게 처리
- 학생관리 기능/DB 로직 변경 없음
- SQL 추가 없음
