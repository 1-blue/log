# Career Ops 운영·복구 Runbook

## 공통 진단 순서

1. 사용자 화면 또는 Slack의 `X-Request-Id`/Request ID를 기록한다.
2. Blog, Worker, n8n, Supabase 순서로 같은 ID와 발생 시각을 확인한다.
3. 로그를 공유하기 전에 JWT, 이메일, 원문, 답변, URL query와 Secret을 제거한다.
4. 재시도 전에 작업 상태와 멱등성 키를 확인한다.
5. `delivery_unknown`처럼 실행 여부가 불명확한 작업은 자동 재전송하지 않는다.

## 장애별 대응

### 관리자 로그인 또는 JWKS 장애

- Supabase Auth 상태, signing key와 Worker의 `SUPABASE_URL`을 확인한다.
- 401은 세션 만료·변조 토큰, 403은 `ADMIN_USER_ID` 불일치를 우선 확인한다.
- JWKS 연결 장애의 503은 계정이나 비밀번호를 변경하지 않고 서비스 회복 후 다시 시도한다.
- 관리자 UUID를 변경했다면 Blog와 Worker를 함께 갱신하고 기존 세션을 종료한다.

### Wanted 수집 실패

- `ACCESS_BLOCKED`, `JOB_EXPIRED`, `PARSER_STRUCTURE_CHANGED`, `URL_MISMATCH`를 구분한다.
- 차단·만료·구조 변경은 반복 수집하지 않고 관리자 화면의 수동 원문으로 전환한다.
- timeout·429·5xx도 자동 반복하지 않고 원문과 Wanted 상태를 확인한 뒤 새 수집 실행을 만든다.
- CAPTCHA 우회, 비공개 API 사용과 redirect 허용은 복구 수단으로 사용하지 않는다.

### n8n 중단 또는 dispatch 실패

```bash
cd apps/n8n
docker compose ps
curl --fail http://localhost:5678/healthz/readiness
docker compose logs --tail=100 n8n
docker compose logs --tail=100 postgres
```

- 로그 공유 전 redaction하고 `.env` 값은 출력하지 않는다.
- readiness 실패 시 PostgreSQL health, disk, memory와 컨테이너 재시작 횟수를 확인한다.
- volume을 보존하는 `docker compose restart n8n`부터 시도한다.
- `docker compose down -v`는 복구 명령으로 사용하지 않는다.
- dispatch가 실패한 지원·수집·분석 레코드는 유지되므로 서비스 회복 후 관리자 화면에서 새 실행을 시작한다.

### OpenAI 분석 실패

- 일반 429·timeout·5xx는 Workflow의 한 번 재시도와 `retryAt`을 확인한다.
- 인증, quota, billing, 입력, incomplete와 schema 오류는 Credential·한도·fixture를 확인한 뒤 수동 재시도한다.
- heartbeat가 20분 이상 없으면 Worker Cron이 stale 실패로 전환했는지 확인한다.
- 기존 실패 작업을 덮어쓰지 않고 새 `analysis_job`을 만들어 입력 hash와 모델·프롬프트 버전을 보존한다.

### callback 실패

- n8n과 Worker의 callback URL, HMAC Secret 쌍, 서버 시각 차이를 확인한다.
- 401은 서명·event/request ID·5분 허용 시간을, 404는 실행 ID와 callback path를 확인한다.
- timeout·429·5xx는 최대 3회 전송 이후 최종 실패한다. DB 상태를 먼저 확인한 뒤 새 분석으로 복구한다.

### Slack 알림 실패

- `failed`는 Bot 권한, 채널 참여, Channel ID와 Webhook 상태를 수정하고 이후 새 도메인 이벤트부터 확인한다.
- `delivery_unknown`은 Slack에 이미 도착했을 수 있으므로 자동 또는 수동 재전송하지 않는다.
- 루트 메시지가 준비되기 전 스레드 알림은 Outbox에 대기해야 하며 직접 임의의 `thread_ts`를 넣지 않는다.
- Slack 장애가 지원·수집·분석 성공을 취소하지 않는지 확인한다.

### Supabase 또는 migration 장애

- linked project ref를 확인하고 운영 DB에 `db reset --linked`를 실행하지 않는다.
- 적용 전 실패라면 SQL을 수정하고 다시 dry-run한다.
- 일부 적용되었다면 기존 migration을 변경하지 않고 보정 migration을 추가한다.
- 데이터 손상 시 쓰기 경로를 중지하고 아래 DB → Storage 순서로 복구한다.

## 백업

### n8n

`apps/n8n/README.md`의 명령으로 PostgreSQL custom-format dump를 만들고 `pg_restore --list`로 검증한다. 다음 세 항목을 같은 복구 지점으로 관리한다.

- n8n PostgreSQL dump
- export한 `career-analysis.json`
- 별도 비밀 저장소의 `N8N_ENCRYPTION_KEY`

### Supabase DB

16단계에서 linked project와 대상 경로를 확인한 뒤 실행한다. `backups/`는 Git에서 제외된다.

```bash
mkdir -p backups/supabase
pnpm exec supabase db dump --linked --file backups/supabase/schema.sql
pnpm exec supabase db dump --linked --data-only --use-copy --file backups/supabase/data.sql
```

dump 파일의 생성 시각, project ref, Git commit과 SHA-256을 별도 manifest에 기록한다. 복원 명령은 새 로컬 또는 임시 프로젝트에서 먼저 시험한다.

### Supabase Storage

DB dump에는 Storage metadata만 포함되고 PDF object 본문은 포함되지 않는 것으로 취급한다. `career-documents` bucket의 object 경로·크기·MIME type·hash manifest와 object 파일을 함께 백업한다. 최초 운영 배포 전에 Supabase S3 호환 자격 증명을 준비해 전용 backup 디렉터리로 동기화하고, 원본 PDF도 별도 보관한다.

복구 순서는 DB schema → DB data → Storage object → object manifest/hash 대조 → signed URL 확인이다. 부분 복구 후 공개 포인터가 없는 object를 임의로 공개하지 않는다.

## Secret 노출

1. 노출된 값의 사용 경로를 중지하고 종류와 영향을 기록한다.
2. Slack Webhook/Bot Token, OpenAI Key, Supabase secret, HMAC Secret을 해당 플랫폼에서 폐기한다.
3. 양방향 HMAC은 Worker와 n8n을 같은 작업 창에서 함께 교체한다.
4. `N8N_ENCRYPTION_KEY`는 일반 Secret처럼 즉시 바꾸지 않는다. DB·Credential 복구 계획 없이 변경하면 기존 Credential을 읽을 수 없다.
5. 새 값을 등록하고 Worker, n8n, Vercel을 필요한 범위만 재배포한다.
6. Git history와 로그에 값이 남았다면 별도 사고 대응으로 제거하고 접근 기록을 검토한다.
7. 테스트 fixture와 `pnpm check:security`를 다시 실행한다.

## 정기 점검

```bash
pnpm verify:offline
cd apps/n8n && docker compose exec -T n8n n8n audit
```

- 매주: 실패·stale·`delivery_unknown`, n8n backup 검증
- dependency/image 변경 전: DB·Workflow backup과 복구 시험
- 매월: Secret 사용 범위, 관리자 계정, 로그 redaction, API 비용 기준선
- 배포 후: 17단계 정상·실패 통합 시나리오 전체 수행
