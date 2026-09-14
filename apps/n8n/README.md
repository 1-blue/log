# n8n 로컬 자동화 환경

취업 준비 자동화를 위한 n8n 2.38.7과 전용 PostgreSQL 18.6을 Docker Compose로 실행한다. 두 이미지는 태그와 multi-platform manifest digest를 함께 고정한다. n8n은 `127.0.0.1:5678`에서만 접근할 수 있고 PostgreSQL 포트는 호스트에 공개하지 않는다.

## 사전 준비

- Docker Desktop 또는 Docker Engine과 Compose v2를 실행한다.
- `.env`가 없다면 `.env.example`을 복사한 뒤 실제 값으로 교체한다.
- 최초 실행 전에 `N8N_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, 양방향 HMAC Secret을 각각 다른 강한 값으로 생성한다.
- n8n 암호화 키는 Credential 복호화에 필요하므로 Credential을 만든 뒤에는 임의로 변경하지 않는다.
- 실제 `.env`, Credential, 암호화 키, 실행 데이터와 백업은 커밋하지 않는다.

현재 `.env`의 HMAC 값은 Worker 설정과 다음처럼 일치해야 한다.

| n8n                      | Worker                |
| ------------------------ | --------------------- |
| `WORKER_TO_N8N_SECRET`   | `N8N_WEBHOOK_SECRET`  |
| `WORKER_CALLBACK_SECRET` | `N8N_CALLBACK_SECRET` |

## 시작과 상태 확인

`apps/n8n`에서 실행한다.

```bash
docker compose --env-file .env.example config --quiet
docker compose up -d
docker compose ps
curl --fail http://localhost:5678/healthz/readiness
```

로그는 비밀값이 포함될 가능성을 고려해 공유 전에 검토한다.

```bash
docker compose logs --tail=100 n8n
docker compose logs --tail=100 postgres
```

브라우저에서 `http://localhost:5678`을 열어 owner 계정을 한 번 생성한다. OpenAI API Key는 `OpenAI Career Analysis`라는 OpenAI Credential로 등록하고, Workflow의 공고 사실·프로필 비교 최초 및 재시도 노드 네 개에 같은 Credential을 연결한다. API Key는 `.env`나 Workflow JSON에 넣지 않는다. Slack Bot Token은 16단계 외부 연동에서 n8n Slack API Credential로 등록한다.

## 채용공고 수집 및 지원 분석 Workflow

owner 계정과 OpenAI Credential을 만든 다음 버전 관리 중인 Workflow를 import한다. 두 OpenAI 노드에 Credential이 연결됐는지 확인한 후 publish한다. n8n 2.x의 CLI publish 결과는 서버 재시작 뒤 적용된다. 기존 smoke Workflow는 비활성 상태로 보존하며 동일한 Webhook 경로를 동시에 게시하지 않는다.

```bash
docker compose exec -T n8n n8n unpublish:workflow --id=careerAnalysisSmoke
docker compose exec -T n8n n8n import:workflow --input=/workflows/career-analysis.json
docker compose exec -T n8n n8n publish:workflow --id=careerAnalysis
docker compose restart n8n
```

Workflow는 다음 순서로 동작한다.

- Worker가 보낸 원문 body와 요청 식별자를 HMAC-SHA256으로 검증한다.
- 유효한 요청에 즉시 `202 Accepted`, 잘못된 서명에 `401`을 반환한다.
- 자동 모드는 Wanted HTML을 리다이렉트 없이 최대 10초 동안 요청한다.
- 수동 모드는 전달받은 원문을 그대로 사용한다.
- 최대 600KB 정책을 적용하고 결과를 다시 HMAC 서명해 Worker 내부 API로 전달한다.
- `application_analysis` 요청은 먼저 공고 사실을 구조화하고, 다음 호출에서 이력서·포트폴리오와 비교한다.
- 두 단계 모두 `gpt-5.4-mini-2026-03-17`, Responses API Structured Outputs, `store: false`를 사용한다.
- 공고 사실은 reasoning `low`와 최대 6,000 출력 토큰, 프로필 비교는 `medium`과 최대 10,000 출력 토큰을 사용한다.
- 각 OpenAI 단계 전후에 실행 회차·단계 회차가 포함된 heartbeat를 보내며 네트워크·timeout·일반 429·5xx만 한 번 재시도한다.
- `Retry-After`가 60초 이하면 따르고 없으면 2초와 결정적 jitter를 사용한다. 인증·결제·quota·입력·미완료·스키마 오류는 자동 재시도하지 않는다.
- Worker callback은 응답 상태를 직접 분류해 네트워크·429·5xx만 최대 3회 전송하며 4xx는 반복하지 않는다.
- `slack_notification` 요청은 공고 루트·스레드는 Slack Bot API로, 시스템 오류는 Incoming Webhook으로 전송한다.
- 공고 스레드에는 Worker가 저장한 `thread_ts`를 사용하고 `reply_broadcast`와 링크 unfurl은 사용하지 않는다.
- Slack 429는 `Retry-After`가 60초 이하일 때 한 번만 재시도한다. 네트워크·timeout·5xx는 `delivery_unknown`으로 콜백하고 자동 재전송하지 않는다.
- Slack Bot API 노드는 16단계에 Credential을 연결하기 전까지 실행하지 않으며, 정적 검증과 fixture 테스트만 수행한다.
- 입력 문서 안의 지시를 따르지 않도록 프롬프트에서 명시하고, Worker가 실제 원문 근거와 결정론적 적합도 점수를 다시 검증한다.

Workflow JSON 자체는 다음 명령으로 비밀값 없이 정적 검증할 수 있다.

```bash
node scripts/validate-workflow.mjs
```

`workflow-policy-fixtures.json`은 Workflow `versionId`와 `careerOpsPolicyVersion`에 묶여 있으며 수집 성공·실패, OpenAI 429·quota·schema 오류, callback 실패와 Slack 응답 분류를 검증한다. Workflow를 변경할 때는 fixture 기대값과 두 버전을 함께 검토한다.

Code 노드는 서명 처리에 Node 내장 `crypto`만 사용할 수 있다. SSRF 보호는 기본 차단 범위와 `100.64.0.0/10`을 차단하며 로컬 Worker callback을 위한 `host.docker.internal`만 예외로 허용한다. Wanted 호스트를 allowlist에 추가하지 않는다.

보안 audit은 로컬 컨테이너에서 실행한다.

```bash
docker compose exec -T n8n n8n audit
```

Community Packages, Templates, Public API, 버전 알림과 진단 telemetry는 비활성화한다. audit에 표시되는 Code·HTTP Request 노드는 HMAC, 응답 분류와 허용된 외부 요청에 필요하므로 제거하지 않고 Workflow 정적 검사, 내장 모듈 `crypto` 제한과 SSRF 보호로 통제한다.

UI에서 수정한 Workflow는 Credential 값과 인증 헤더가 없는지 확인한 다음 게시 버전을 다시 export한다.

```bash
docker compose exec -T n8n n8n export:workflow \
  --id=careerAnalysis \
  --published \
  --output=/tmp/career-analysis.json
docker compose cp \
  n8n:/tmp/career-analysis.json \
  workflows/career-analysis.json
docker compose exec -T n8n rm /tmp/career-analysis.json
```

`workflows/`는 컨테이너에 읽기 전용으로 연결되므로 실행 중인 n8n이 저장소 파일을 직접 덮어쓸 수 없다.

## 종료와 재시작

일반 종료에는 volume을 보존하는 명령만 사용한다.

```bash
docker compose stop
docker compose start
docker compose down
docker compose up -d
```

`docker compose down -v`는 owner 계정, Credential, Workflow와 실행 기록을 포함한 volume 데이터를 삭제하므로 초기화 의도가 있을 때만 사용한다.

## 백업과 복구

활발히 사용하는 동안 주 1회, 이미지 업데이트나 volume 변경 전에는 `backups/`에 PostgreSQL 백업을 만든다. 이 디렉터리는 Git에서 제외된다.

```bash
mkdir -p backups
n8n_backup_file="backups/n8n-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T postgres pg_dump -U n8n -d n8n -Fc > "$n8n_backup_file"
docker compose exec -T postgres pg_restore --list < "$n8n_backup_file" >/dev/null
```

마지막 명령은 기존 DB를 변경하지 않고 백업 카탈로그를 읽어 파일 형식을 검증한다.

복구는 기존 DB 내용을 덮어쓸 수 있으므로 n8n을 중지하고 대상 파일을 확인한 뒤 실행한다.

```bash
docker compose stop n8n
n8n_restore_file="backups/n8n-YYYYMMDD-HHMMSS.dump"
docker compose exec -T postgres pg_restore \
  -U n8n \
  -d n8n \
  --clean \
  --if-exists < "$n8n_restore_file"
docker compose start n8n
```

DB 백업만으로 Credential을 복호화할 수 없으므로 `.env`의 `N8N_ENCRYPTION_KEY`도 별도의 안전한 비밀 저장소에 보관한다.

## 저장소 원칙

- `workflows/`에는 n8n에서 export한 Workflow JSON만 저장한다.
- Credential export와 실행 데이터는 저장소에 넣지 않는다.
- 공고 수집 요청과 callback payload는 `packages/contracts`의 Zod 계약을 기준으로 한다.
- Slack Bot Token은 n8n Credential에만 저장하고 payload, 환경변수, Workflow export에는 포함하지 않는다.
- 운영 공개 주소, HTTPS, reverse proxy, 외부 task runner와 백업 자동화는 운영 배포 단계에서 추가한다.
