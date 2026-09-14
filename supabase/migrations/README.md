# Supabase migration 운영 규칙

이 저장소의 원격 Supabase schema는 migration 파일을 기준으로 관리한다.

## 현재 단계

- 문서 버전, 지원 공고·지원 이력, API 멱등성 구조가 원격에 적용되어 있다.
- 10단계에서는 `job_posting_collection_runs`, 불변 `job_posting_snapshots`, 원자적 완료 RPC와 소유자 조회 RLS를 추가했다.
- 11단계에서는 `analysis_jobs`, 불변 `analysis_results`, 단계별 실행 메타데이터와 원자적 완료·상태 이벤트 RPC를 추가했다.
- 12단계에서는 분석 이벤트 revision, 단계별 재시도, heartbeat, 논리적 취소와 정체 작업 정리 RPC를 추가했다.
- 13단계에서는 분석 사용자 검토, 요구사항 판정, 면접 질문·append-only 답변, 준비 체크리스트, 구조화 회고 테이블과 자동 생성·backfill 로직을 추가했다.
- 14단계에서는 `slack_notifications` Outbox, 공고별 `slack_job_threads`, 도메인 이벤트 trigger, 채널별 claim·완료·stale 처리 RPC와 조회 전용 RLS를 추가했다.
- 15단계에서는 문서 metadata 쓰기를 Worker service role로만 제한하고, 전체 public 테이블의 RLS·권한·`security definer` 설정과 주요 query index 사용을 pgTAP으로 검증한다.
- 로컬 Supabase는 다른 프로젝트와 충돌하지 않도록 `5532x` 포트를 사용한다. 원격 검증 전에는 `db reset --local`, schema lint와 pgTAP을 우선 실행한다.

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

로컬 전체 검증은 저장소 루트에서 실행한다.

```bash
pnpm verify:offline
```

`db:push` 전에 project ref와 프로젝트 이름이 현재 사용 중인 Supabase 프로젝트와 일치하는지 확인한다. 원격 DB를 Dashboard의 Table Editor나 SQL Editor에서 직접 변경하지 않는다.

적용된 migration 파일은 수정하거나 삭제하지 않는다. 문제가 생기면 원격 데이터를 지우는 reset 대신 후속 보정 migration을 추가한다. pgTAP 검증은 `supabase/tests/database`, 원격 rollback 검증은 `supabase/tests/integration`에 보관한다. 원격 검증은 `pnpm exec supabase db query --linked --file <파일>`로 실행하며 반드시 `BEGIN`과 `ROLLBACK`을 유지해 테스트 데이터를 남기지 않는다.

Supabase CLI 인증 토큰, DB 비밀번호, service role/secret key와 실제 PDF는 저장소에 커밋하지 않는다.
