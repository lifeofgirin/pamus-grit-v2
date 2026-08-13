# Pamus Grit v2 - v18.3.7.4.1

## Vercel TypeScript 빌드 오류 수정

오류:
`PromiseLike<any>` is not assignable to `Promise<any>`

원인:
Supabase query builder의 `.then()` 반환형이 PromiseLike인데
work-today에서 `Promise<any>[]` 배열로 선언함.

수정:
- jobs 타입을 `PromiseLike<any>[]`로 변경
- Promise.all 호출 전에 `Promise.resolve()`로 정규화

기능 변경 없음.
SQL 추가 없음.
