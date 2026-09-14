# Career Ops 운영 배포 체크리스트

이 문서는 16단계에서 외부 서비스를 연결할 때 사용한다. 값 자체는 기록하지 않고 플랫폼별 변수 이름, 갱신 일시와 확인자만 별도의 비밀 관리 도구에 기록한다.

## 환경변수 대응표

| 역할            | Blog / Vercel                          | Worker / Cloudflare                     | n8n                                       |
| --------------- | -------------------------------------- | --------------------------------------- | ----------------------------------------- |
| 서비스 주소     | `NEXT_PUBLIC_CLIENT_URL`               | `APP_BASE_URL`                          | `APP_BASE_URL`                            |
| Supabase 주소   | `NEXT_PUBLIC_SUPABASE_URL`             | `SUPABASE_URL`                          | -                                         |
| 브라우저 인증   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | -                                       | -                                         |
| 서버 DB 권한    | -                                      | `SUPABASE_SECRET_KEY`                   | -                                         |
| 단일 관리자     | `ADMIN_USER_ID`                        | `ADMIN_USER_ID`                         | -                                         |
| Worker 주소     | `NEXT_PUBLIC_WORKER_API_URL`           | -                                       | `WORKER_CALLBACK_URL`                     |
| Worker → n8n    | -                                      | `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | `WORKER_TO_N8N_SECRET`                    |
| n8n → Worker    | -                                      | `N8N_CALLBACK_SECRET`                   | `WORKER_CALLBACK_SECRET`                  |
| Slack 오류 채널 | -                                      | `SLACK_ERROR_WEBHOOK_URL`               | `SLACK_ERROR_WEBHOOK_URL`                 |
| Slack 공고 채널 | -                                      | -                                       | `SLACK_JOB_CHANNEL_ID`                    |
| n8n 영속성      | -                                      | -                                       | `N8N_ENCRYPTION_KEY`, `POSTGRES_PASSWORD` |

다음 값은 반드시 같아야 한다.

- Blog와 Worker의 `ADMIN_USER_ID`
- Worker `N8N_WEBHOOK_SECRET`과 n8n `WORKER_TO_N8N_SECRET`
- Worker `N8N_CALLBACK_SECRET`과 n8n `WORKER_CALLBACK_SECRET`
- Blog URL, Worker `APP_BASE_URL`, n8n `APP_BASE_URL`의 운영 Origin
- Blog `NEXT_PUBLIC_WORKER_API_URL`과 실제 Worker 운영 URL

OpenAI API Key와 Slack Bot Token은 환경변수가 아니라 n8n Credential에 저장한다. `.env.ci.example`의 값은 자동 배포를 도입할 때만 사용하며 15단계에서는 등록하지 않는다.

## 배포 전

- [ ] `pnpm verify:offline` 통과
- [ ] 현재 Git commit과 배포 대상 branch 확인
- [ ] Supabase project ref, Vercel project, Cloudflare account와 n8n instance 확인
- [ ] n8n DB, Workflow, `N8N_ENCRYPTION_KEY` 백업
- [ ] Supabase DB와 Storage object 백업 및 manifest 검증
- [ ] `pnpm db:migrations`와 `pnpm db:push:dry-run` 결과 검토
- [ ] Secret을 로그·명령행 인자·문서에 붙여 넣지 않았는지 확인
- [ ] OpenAI·Slack Credential의 최소 권한과 사용 한도 확인

## 배포 순서

1. Supabase backup을 확인한 뒤 `pnpm db:push`와 `pnpm db:lint`를 실행한다.
2. `pnpm db:types` 결과가 기존 계약과 일치하는지 확인하고 필요한 코드와 함께 커밋한다.
3. 기존 n8n Workflow를 export한 뒤 새 Workflow를 import하고 Credential을 연결해 publish한다.
4. Cloudflare secret을 등록하고 Worker를 배포한 뒤 `/health`를 확인한다.
5. Vercel 환경변수를 등록하고 새 production deployment를 생성한다. 환경변수 변경은 기존 배포에 소급 적용되지 않는다.
6. Blog → Worker → n8n callback의 Origin, URL과 HMAC 조합을 확인한다.
7. 17단계 통합 테스트를 시작하고 Request ID를 기록한다.

## 배포 후 확인

- [ ] `/health` 200과 새로운 Request ID
- [ ] 관리자 로그인, 로그아웃과 다른 UUID 차단
- [ ] 관리자 응답의 `private, no-store`와 보안 헤더
- [ ] 문서 signed URL 만료와 비공개 문서 차단
- [ ] 공고 수집·분석 상태 polling과 callback
- [ ] Slack 루트·스레드·오류 알림
- [ ] Worker, n8n과 Supabase 로그에 Secret·원문·답변 미노출
- [ ] 비용·latency·오류율 기준선 기록

## Rollback 기준

- 인증 우회, RLS 오류, 데이터 손상 또는 Secret 노출은 즉시 rollback한다.
- UI만 실패하면 Vercel의 직전 정상 deployment로 되돌린다.
- Worker는 `pnpm --filter worker exec wrangler rollback`을 사용하되 binding과 DB schema는 함께 돌아가지 않으므로 호환성을 먼저 확인한다.
- migration은 원격 reset이나 기존 파일 수정으로 되돌리지 않고 후속 보정 migration을 적용한다.
- n8n은 현재 Workflow를 unpublish하고 백업한 직전 Workflow를 import·publish한다.
- DB 복원이 필요하면 쓰기 경로를 중지하고 `OPERATIONS_RUNBOOK.md`의 복구 순서를 따른다.

## 업데이트 정책

- pnpm 의존성은 별도 branch에서 lockfile diff, release note와 `pnpm audit --prod`를 확인하고 `pnpm verify:offline` 후 반영한다.
- n8n·PostgreSQL 이미지는 자동 업데이트하지 않는다. release note와 보안 공지를 확인한 뒤 백업, 새 digest 고정, 로컬 복구 시험 순서로 갱신한다.
- Wrangler와 Supabase CLI는 배포 도구이므로 프로젝트에 고정된 버전을 사용한다.
- major version은 애플리케이션·Workflow·DB를 한 번에 올리지 않고 구성요소별로 분리한다.
