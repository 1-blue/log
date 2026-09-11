# Supabase migration 운영 규칙

이 저장소의 원격 Supabase schema는 migration 파일을 기준으로 관리한다.

## 현재 단계

- 로컬 Supabase stack은 사용하지 않는다.
- 3단계에서는 `document_versions`, `document_publications`, `career-documents` bucket과 RLS만 추가한다.
- 지원 공고·분석·면접 테이블은 각 기능을 구현하는 단계에서 별도 migration으로 추가한다.
- 실제 PDF 파일은 5단계에서 업로드한다.

## 원격 적용 순서

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <현재-프로젝트-ref>
pnpm db:migrations
pnpm db:push:dry-run
pnpm db:push
pnpm db:lint
pnpm db:types
```

`db:push` 전에 project ref와 프로젝트 이름이 현재 사용 중인 Supabase 프로젝트와 일치하는지 확인한다. 원격 DB를 Dashboard의 Table Editor나 SQL Editor에서 직접 변경하지 않는다.

적용된 migration 파일은 수정하거나 삭제하지 않는다. 문제가 생기면 원격 데이터를 지우는 reset 대신 후속 보정 migration을 추가한다. 이번 단계의 검증 SQL은 `supabase/tests/database`에 보관하며, 원격 SQL Editor에서 `BEGIN`과 `ROLLBACK`으로 실행해 테스트 데이터를 남기지 않는다.

Supabase CLI 인증 토큰, DB 비밀번호, service role/secret key와 실제 PDF는 저장소에 커밋하지 않는다.
