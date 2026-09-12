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

브라우저에서 `http://localhost:5678`을 열어 owner 계정을 한 번 생성한다. 이후 OpenAI API Key는 OpenAI Credential, Slack Bot Token은 Slack API Credential로 등록하며 `.env`나 Workflow JSON에 넣지 않는다.

## 샘플 Webhook

owner 계정을 만든 다음 버전 관리 중인 샘플 Workflow를 import하고 publish한다. n8n 2.x의 CLI publish 결과는 서버 재시작 뒤 적용된다.

```bash
docker compose exec -T n8n n8n import:workflow --input=/workflows/career-analysis-smoke.json
docker compose exec -T n8n n8n publish:workflow --id=careerAnalysisSmoke
docker compose restart n8n
```

컨테이너가 다시 healthy 상태가 되면 로컬 요청으로 확인한다.

```bash
curl --include \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-Request-Id: 00000000-0000-4000-8000-000000000001' \
  --data '{"schemaVersion":"1.0.0","eventId":"00000000-0000-4000-8000-000000000002","requestId":"00000000-0000-4000-8000-000000000001"}' \
  http://localhost:5678/webhook/career-analysis
```

이 Workflow는 로컬 연결만 검사하는 임시 골격이며 HMAC을 아직 검증하지 않는다. 실제 서명 검증이 연결되기 전에는 Webhook이나 n8n UI를 Tunnel로 공개하지 않는다.

UI에서 수정한 Workflow는 Credential 값과 인증 헤더가 없는지 확인한 다음 게시 버전을 다시 export한다.

```bash
docker compose exec -T n8n n8n export:workflow \
  --id=careerAnalysisSmoke \
  --published \
  --output=/tmp/career-analysis-smoke.json
docker compose cp \
  n8n:/tmp/career-analysis-smoke.json \
  workflows/career-analysis-smoke.json
docker compose exec -T n8n rm /tmp/career-analysis-smoke.json
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
```

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
- 공고 분석 요청과 callback payload는 `packages/contracts`의 JSON Schema를 기준으로 한다.
- 운영 공개 주소, HTTPS, reverse proxy, 외부 task runner와 백업 자동화는 운영 배포 단계에서 추가한다.
