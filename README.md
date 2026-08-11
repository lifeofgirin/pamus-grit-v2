# Pamus Grit v2 - v18.3.1

## Vercel build 오류 수정
- 반별 주간 영문 설명 JSX 문법 오류 수정
- 선생님 한/영 토글에서 잘못 참조한 `me`를 실제 로그인 사용자 객체 `user`로 수정
- 모바일 카드 간소화 / 한영 전환 / 90일 로그인 유지 기능은 그대로 유지
- SQL 추가 없음

검증:
- TypeScript 파서 기준 JSX 문법 오류 없음
- 로컬 컨테이너에는 Next.js 실행 패키지가 없어 전체 `next build`는 실행 불가
