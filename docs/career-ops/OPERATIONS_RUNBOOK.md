# Career Ops 운영·복구 Runbook

## 공통 진단 순서

1. 사용자 화면 또는 Slack의 `X-Request-Id`/Request ID를 기록한다.
2. Blog, Worker, n8n, Supabase 순서로 같은 ID와 발생 시각을 확인한다.
3. 로그를 공유하기 전에 JWT, 이메일, 원문, 답변, URL query와 Secret을 제거한다.
4. 재시도 전에 작업 상태와 멱등성 키를 확인한다.
5. `delivery_unknown`처럼 실행 여부가 불명확한 작업은 자동 재전송하지 않는다.

## 관리자별 전체 데이터 초기화

지정 관리자 소유의 Career Ops 업무 데이터, 문서, 공개 설정과 PDF만 제거한다.
관리자 Auth 계정, 블로그 게시글, 외부 Credential, 실제 Slack 메시지와 n8n 실행
이력은 유지한다. 운영 초기화는 삭제 대상과 검증된 백업을 보여준 뒤 별도 승인을 받는다.

```bash
ADMIN_USER_ID=<관리자 UUID> pnpm db:reset:career-ops:dry-run
ADMIN_USER_ID=<관리자 UUID> pnpm db:reset:career-ops --prepare-backup
# 백업과 대상 확인 후 별도 승인된 경우에만 실행
ADMIN_USER_ID=<관리자 UUID> pnpm db:reset:career-ops --apply \
  --backup <검증된 백업 디렉터리> --confirm <연결 프로젝트 ref:관리자 UUID>
```

기본은 dry-run이다. DB 프로젝트와 Storage 설정 불일치, 실행 중인 분석·추출·수집·알림,
백업 실패, 백업 이후 데이터 변경 시 중단한다. 준비·삭제 동안 관리자별 유지보수 잠금으로
새 쓰기와 PDF 업로드 완료를 막는다. 백업 준비는 잠금을 해제하며 데이터를 삭제하지 않는다.

백업은 Git에서 제외된 `.local/career-ops-backups/<시각>`에 디렉터리 700, 파일 600으로
보존한다. DB 데이터와 PDF 본문·크기·SHA-256 manifest를 저장하고 임시 격리 DB에
복원해 삭제 대상 fingerprint를 대조한다. PDF는 원본과 백업의 바이트 해시를 대조한다.
백업은 민감한 원문을 포함하므로 외부 전달 전에 암호화한다.

부분 삭제 실패 시 유지보수 잠금과 백업을 유지한다. 같은 승인된 명령으로 정리 큐를
재처리하고 관리자 존재, 업무 데이터·공개 포인터·PDF 잔여 0을 확인한다.
전역 트리거 비활성화나 프로젝트 전체 DB reset은 사용하지 않는다.

## 보관 자료 영구 삭제

- 지원·문서는 보관된 경우에만 삭제한다. 실행 중인 관련 작업은 먼저 종료해야 한다.
- 문서는 현재 선택뿐 아니라 과거 분석 참조도 검사한다. 활성 지원이 있으면 보관할
  지원 목록을 표시하고 거부하며, 모두 보관됐다면 해당 지원과 종속 기록도 삭제한다.
- 확인 화면의 fingerprint가 변경되면 409로 거부한다. 삭제 영향을 다시 확인한다.
- PDF는 DB 트랜잭션의 정리 큐에서 Storage API로 삭제한다. 화면의 작업 상태가
  `completed`일 때만 완전 삭제가 끝난 것이다. 실패는 Cron에서 재시도한다.
- `GET /v1/deletion-operations/:id`로 관리자 소유 작업의 정리 상태를 확인한다.
- 삭제된 대상의 늦은 콜백은 404이며 이전 추출 이벤트는 최신 결과를 덮어쓰지 않는다.

## 문서·OCR를 보존하는 공고 데이터 초기화

공고·수집·지원·적합도 분석·면접·관련 알림 DB 기록만 관리자 단위로 초기화한다.
문서·PDF 원본·OCR 텍스트·문서 프로필·확인 근거·기본 버전·공개 설정, AI 사용량과 잔액,
문서 알림, 문서 작업의 멱등성 기록은 유지한다. 실제 Slack 메시지와 n8n 실행 이력도 유지한다.

```bash
ADMIN_USER_ID=<관리자 UUID> pnpm db:reset:career-jobs
ADMIN_USER_ID=<관리자 UUID> pnpm db:reset:career-jobs --prepare-backup
# 최신 삭제 대상과 검증된 백업을 보고 별도 승인한 경우에만 실행
ADMIN_USER_ID=<관리자 UUID> pnpm db:reset:career-jobs --apply \
  --backup <검증된 백업 디렉터리> --confirm <연결 프로젝트 ref:관리자 UUID>
```

기본은 dry-run이며 `--include-documents`와 함께 사용할 수 없다. 전체 리셋 백업을 이 모드에
재사용하지 않는다. 유지보수 잠금·실행 중 작업 차단·백업 복원 시험·최신 대상 대조를 모두 적용한다.
삭제 트랜잭션 전후 보존 대상의 fingerprint와 모든 PDF 원본의 크기·해시를 대조하며 PDF 정리 큐를
생성하지 않는다. 삭제 후 보존 대상이 달라졌다면 완료로 보고하지 않고 백업을 유지해 점검한다.

## PDF 추출·OCR

모든 PDF를 기존 OpenAI Credential의 Responses API로 AI OCR 처리한다. 텍스트 레이어 추출과
fallback은 사용하지 않는다. 20MB·30페이지 이내, 요청별 180초, 일시적 오류 최대 한 번 재시도다.
모델은 `gpt-5.6-luna`이며 PDF 전체 페이지를 PNG로 렌더링해 페이지 번호와 함께
`input_image`로 전달하고 `store: false`를 사용한다. 텍스트가 벡터 윤곽선으로 저장된
PDF도 페이지 전체를 읽도록 하며, PDF 안의 삽화만 추출해 OCR하지 않는다.
렌더링 모듈은 `Dockerfile.ocr`의 격리된 pnpm 런타임에 고정한다. 기본 n8n 이미지의
미설치 native canvas binding에 의존하지 않는다. 일반 텍스트 PDF도 같은 렌더링·OCR 경로를 사용한다.
페이지 이미지는 최대 너비 1,600px·높이 2,600px, 이미지별 data URL 4MiB·전체 24MiB로
제한하고 렌더링 종료 시 parser를 정리한다. 지나치게 긴 페이지는 자동 추출 대신 수동 입력을 안내한다.
페이지 누락·불완전 응답·빈 결과·제한 초과는 실패로 표시한다. OCR 결과는 사용자 검토가
필요하며, 재추출 또는 수동 보정 저장 후 분석할 수 있다. 수동 보정 이후 늦은 콜백은 무시한다.

## 장애별 대응

### 관리자 로그인 또는 JWKS 장애

- Supabase Auth 상태, signing key와 Worker의 `SUPABASE_URL`을 확인한다.
- 401은 세션 만료·변조 토큰, 403은 `ADMIN_USER_ID` 불일치를 우선 확인한다.
- JWKS 연결 장애의 503은 계정이나 비밀번호를 변경하지 않고 서비스 회복 후 다시 시도한다.
- 관리자 UUID를 변경했다면 Blog와 Worker를 함께 갱신하고 기존 세션을 종료한다.

### 공고 수집·AI 구조화 실패

- URL의 `#…` fragment는 검증 후 제거해 저장·중복 판정한다. `rec_idx` 등 공고 식별 query와 `%23`은 유지한다. HTTPS·공개 호스트·Credential 및 내부망 제한은 그대로다.
- 자동 수집은 원티드 상세 URL만 허용한다. 다른 플랫폼도 등록·공통 분석할 수 있으나 원문은 수동 입력한다.
- HTML 정리는 전송용 텍스트 정규화일 뿐 자격요건 등을 해석하는 플랫폼별 파서는 아니다. 메타데이터·섹션·사실은 한 번의 AI 구조화로 저장하고 적합도 비교에 재사용한다.
- 수동 원문은 1~100,000자를 허용하되 공백만 있는 입력은 거부한다. 주요 업무·자격요건·우대사항 등은 필수가 아니며 누락값을 null/빈 배열로 저장하고 미기재·복사 누락 가능성을 안내한다. 요구사항이 없으면 적합도·내 판정·근거 확인율은 0점/100%가 아닌 `산정 불가`다.
- `SOURCE_TEXT_EMPTY`는 빈 원문, `SOURCE_NOT_JOB_POSTING`은 대상 채용 정보를 확인할 수 없는 원문이다. 이미지·iframe의 글자가 텍스트 복사에서 누락됐는지도 확인한다. `ACCESS_BLOCKED`, `JOB_EXPIRED`, `AUTOMATIC_COLLECTION_UNSUPPORTED`도 구분해 실제 공고 원문을 입력한다.
- `AI_RESPONSE_INVALID`, `AI_EVIDENCE_MISMATCH`, `AI_SOURCE_MISMATCH`, `AI_METADATA_MISMATCH`는 원문 필수 항목 부족이 아닌 AI 결과 오류다. 잘못된 결과는 저장하지 않으며 같은 원문으로 새 요청을 만들 수 있다. 이때 지원자에게 없는 역량을 임의로 만들지 않는다.
- `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_SERVICE_UNAVAILABLE`만 일시적 AI 오류로 분류한다. `AI_AUTHENTICATION_FAILED`는 Credential·권한, `AI_BILLING_LIMIT`는 잔액·프로젝트 한도를 확인한다. 이 실패들은 `failed`로 저장해 Slack에 원문 입력 필요로 잘못 알리지 않는다. 이전 callback의 `AI_STRUCTURING_FAILED`도 계속 지원한다.
- 화면과 Slack의 오류 설명은 `JOB_POSTING_COLLECTION_ERROR_MESSAGES`를 공유하며 원문·API Key·provider 원본 오류를 포함하지 않는다. Request ID로 같은 실행을 추적한다.
- `AI_RESPONSE_INVALID`에서 Worker의 `job_posting_collection_parse_failed.schemaIssue`를 확인한다. 최대 10개의 필드 경로와 검증 코드만 기록하며 입력값·미지정 필드명·Zod 원본 메시지는 기록하지 않는다. n8n의 `job_structure_response_invalid.reason`은 토큰 한도·미완료·refusal·JSON/출력 형태 실패를 구분한다. AI 호출의 `succeeded`와 후속 구조 검증의 성공은 다르다.
- 공고 구조화 요청에는 서버와 같은 길이·배열 개수·UUID 제약을 전달한다. OCR·개인 자료 비교 요청의 기존 스키마 변환은 변경하지 않는다. 초기 구조화 단계에서 중복된 요구사항 ID는 서버가 충돌 없는 로컬 ID로 재부여하며 내용은 삭제하지 않는다. 서로 떨어진 원문 줄을 합친 인용은 모든 줄이 실제 원문에 있을 때에만 독립된 인용으로 분리한다. 인용 개수 제한·출처·원문 일치 검증은 계속 적용한다.
- `job_structure_required`는 새 버전의 공고 사실이 없는 기존 스냅샷이다. 재수집하거나 원문을 수동 입력한 뒤 분석한다.
- timeout·429·5xx는 제한된 재시도 후 원문과 플랫폼 상태를 확인하고 새 수집 실행을 만든다.
- CAPTCHA 우회, 비공개 API 사용과 redirect 허용은 복구 수단으로 사용하지 않는다.

### 지원 상태와 2026-10-27 변경 배포

- 지원 상태는 상세 공통 상단과 분석 작업 화면에서 변경한다. 정보 폼은 상태를 전송하지 않으며 문서 선택·제출 후 잠금·보관 정책은 그대로 적용한다.
- 배포 전 `pnpm --filter @workspace/contracts check-schemas`와 `pnpm verify:offline`을 실행한다. 후자는 운영 연결 없이 임시 DB에서 migration·pgTAP·DB 생성 타입을 검증한다.
- nullable 점수와 snapshot warnings를 읽는 Blog를 먼저 배포하고, 새 enum migration `20261027010000_add_job_collection_diagnostics.sql` → Worker → n8n 순서로 반영한다. n8n의 새 오류 코드를 DB/Worker보다 먼저 배포하지 않는다.
- 구조화 생성/검증 버전은 `job-structure-v2-validated-output-v2`, 비교 prompt는 `profile-match-v2-readability-sparse-v1`이다. 기존 기록을 삭제하거나 자동 재분석하지 않으며 새 요청에서 갱신된 버전의 캐시를 사용한다. 이번 검증 보완은 별도 DB migration 없이 Worker → n8n 순서로 배포할 수 있다.

### 배포 전 실제 AI 구조화 검증

`pnpm test:career-ai:live`는 기본적으로 호출 계획만 출력한다. 일반 공고·사람인형 짧은 공고·제목/회사명 누락·여러 직무·긴 문단·통계/광고 혼합·입력 내 명령·접근 차단 안내의 합성 입력 8종을 사용한다. `pnpm test`와 `verify:offline`에는 유료 호출을 포함하지 않는다.

```bash
pnpm test:career-ai:live
pnpm test:career-ai:live --execute --repeat 2
```

실제 호출은 명시적인 `--execute`와 테스트 프로세스의 `OPENAI_API_KEY`가 필요하다. 이는 **테스트 전용**이며 Worker의 운영 환경 변수에 키를 추가하는 작업이 아니다. 선택적으로 `OPENAI_BASE_URL`을 지정할 수 있다. 키를 터미널 명령 인수·출력·Workflow JSON에 넣지 않는다.

키를 직접 전달하지 않으려면 `--transport <로컬 어댑터.mjs>`로 n8n의 기존 Credential 참조를 사용하는 미게시 임시 Workflow에서 동일한 OpenAI 노드를 실행한다. 어댑터는 stdin의 `{parameters,cases}`를 받아 stdout에 `[{id,response}]`만 반환해야 한다. 운영 Workflow·지원·문서 데이터는 변경하지 않고 테스트 Workflow와 실행 기록을 정리한다. Credential을 export하거나 복호화하지 않는다.

`--cases standard,saramin-sparse`로 입력을 선택하고 `--repeat 1..3`으로 반복한다. 한 실행은 최대 24회로 제한한다. `--source-file <파일>`은 별도로 승인받은 공고 원문만 `incident-regression` 입력으로 추가하며 이력서·포트폴리오는 사용하지 않는다. `--compare-schema`는 기존/수정 요청 스키마를 비교하되 양쪽 모두 **현재** 서버 검증 코드로 검사한다. 과거 응답 자체를 재현한다는 의미는 아니다.

실제 AI 응답에 체크인된 n8n 결과 구성 코드와 Worker 검증을 순서대로 적용한다. 결과·토큰·저장된 단가 기준 추정 비용은 Git에서 제외된 `.local/job-structure-live-*.json`에 제한 권한으로 생성한다. 비용 정보가 없으면 0달러가 아닌 미산정으로 기록한다. 실패 응답은 같은 디렉터리의 `*-responses.json`에만 보관하므로 외부 공유 전에 개인정보를 검토한다. 이 경로는 운영 사용량 원장·지원/문서·Slack에 쓰지 않으며, 실제 운영 DB 저장과 화면 동작은 자동 회귀 검사 및 배포 후 smoke test와 구분한다.

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
