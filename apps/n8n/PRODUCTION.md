# Lightsail 운영 배포

이 문서는 `n8n.nintory.com`의 단일 인스턴스 운영 절차다. 저장소의 `compose.yml`은 로컬 전용이며 운영에서는 `compose.prod.yml`만 사용한다. 이 구성은 Caddy가 HTTPS를 종료하고 n8n과 PostgreSQL은 Docker 네트워크에만 연결한다. 편집 화면은 Caddy Basic Auth와 n8n owner 로그인을 모두 요구한다. `/webhook/*`과 `/healthz/readiness`만 Basic Auth 없이 열리고, Workflow Webhook은 별도로 HMAC 검증을 통과해야 처리된다. 이 경로 자체는 인터넷에서 접근 가능하다.

## 외부 준비 사항

실제 AWS 리소스와 DNS 변경은 이 저장소의 파일만으로 수행되지 않는다. 운영자가 아래 값을 정하고 설정해야 한다.

| 위치                                | 필요한 값 또는 작업                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Lightsail                       | Linux 인스턴스의 리전·플랜·인스턴스 이름, 정적 IPv4 주소, SSH 접속 계정과 공개키, 자동 스냅샷 사용 여부                                                                   |
| Lightsail 방화벽                    | TCP 80/443 공개, TCP 22는 운영자 접속 범위로 제한, 5678/5432 미공개. IPv6 사용 시 IPv6 규칙도 확인                                                                        |
| DNS                                 | `n8n.nintory.com` A 레코드를 정적 IPv4에 연결. AAAA 레코드가 있으면 실제 IPv6 인스턴스로 연결되는지 확인                                                                  |
| 운영 연결                           | 공개 블로그 주소, Worker의 운영 호스트와 `/v1/internal` callback 주소, Worker의 `N8N_WEBHOOK_URL=https://n8n.nintory.com/webhook/career-analysis`                         |
| 서버 전용 비밀                      | n8n 암호화 키, PostgreSQL 비밀번호, 양방향 HMAC 키, Slack 에러 Webhook URL, Caddy Basic Auth 암호 해시                                                                    |
| GitHub environment `n8n-production` | `N8N_PUBLIC_URL`, `N8N_DEPLOY_HOST`, `N8N_DEPLOY_USER`, `N8N_WORKFLOW_ID` 변수와 `N8N_DEPLOY_SSH_KEY`, `N8N_DEPLOY_KNOWN_HOSTS` secret. `master` 브랜치만 배포하도록 제한 |
| GitHub repository variable          | 첫 수동 배포가 성공한 뒤 `ENABLE_PRODUCTION_DEPLOY=true`로 자동 배포 활성화                                                                                               |

GitHub SSH secret에는 이 서버 전용 배포 키만 넣는다. `N8N_DEPLOY_KNOWN_HOSTS`는 접속 전에 **별도 신뢰 경로에서 확인한** 서버 호스트키를 저장한다. 배포 시 `ssh-keyscan` 결과를 그대로 신뢰하지 않는다. `.env`의 실값은 서버에만 두고 GitHub Actions로 전송하지 않는다. GitHub 환경 보호 규칙은 저장소 공개 여부와 요금제에 따라 지원 범위가 다를 수 있으므로 현재 저장소에서 적용 상태를 확인한다.

Lightsail 인스턴스, 정적 IP, 스냅샷은 비용에 영향을 줄 수 있다. 리소스 생성·요금제 선택·DNS 변경은 별도 확인 후 수행한다.

## 첫 설치

1. 운영자가 Lightsail에 Ubuntu 계열 인스턴스를 만들고 정적 IP와 DNS, 방화벽을 설정한다. Docker Engine과 Compose v2를 설치하고 자동 보안 업데이트를 활성화한다. `n8n-deploy` 계정을 만들고 Docker 사용 권한을 부여한다. Docker 그룹은 사실상 호스트 관리자 권한이므로 이 계정에만 배포 키를 허용한다.
2. `n8n-deploy`가 `/opt/career-ops-n8n`을 소유하도록 만들고, 저장소의 `compose.prod.yml`, `Caddyfile`, `workflows/*.json`, `scripts/{backup,deploy}-production.sh`를 해당 위치로 복사한다. GitHub Actions 첫 실행도 이 파일 복사를 수행하지만 대상 디렉터리의 소유권은 먼저 준비해야 한다.
3. `.env.production.example`을 참고해 서버의 `/opt/career-ops-n8n/.env`를 직접 만든다. `N8N_DOMAIN=n8n.nintory.com`, trailing slash가 없는 `N8N_PUBLIC_URL=https://n8n.nintory.com`, Blog와 Worker의 운영 주소를 입력하고 `chmod 600`으로 제한한다. `CADDY_BASIC_AUTH_HASH`는 터미널에서 `docker run --rm -it caddy:2.10.2 caddy hash-password`로 생성한 bcrypt 해시를 **작은따옴표**로 감싸 입력한다. 원문 비밀번호와 암호화 키는 별도 안전한 비밀 저장소에 보관한다. HMAC 두 값은 Worker 설정과 각각 일치시킨다.
4. DNS가 정적 IP를 가리키고 80/443이 열린 것을 확인한 뒤 GitHub Actions의 **Deploy Career Ops**를 `n8n` 대상으로 수동 실행한다. Caddy는 첫 기동 시 인증서를 발급하고 자동 갱신한다. Actions는 `/healthz/readiness`가 `200`인지 확인한다.
5. `https://n8n.nintory.com`에서 Caddy 인증을 통과해 n8n owner를 생성한다. OpenAI와 Slack Credential을 n8n UI에 등록하고 5개 OpenAI 노드와 Slack 노드에 연결한다. 기존 로컬 데이터 이전이 필요하면 아래 복구 절차를 먼저 수행하고 암호화 키가 동일한지 확인한다.
6. 최신 Workflow를 검토 후 import·publish한다. `README.md`의 CLI 절차를 참고하되 운영에서는 항상 `docker compose --env-file .env -f compose.prod.yml`을 사용한다. 동일 Webhook 경로의 smoke Workflow는 publish하지 않는다. GitHub Actions는 `ENABLE_PRODUCTION_DEPLOY=true`, `N8N_PUBLIC_URL`, `N8N_WORKFLOW_ID`가 설정된 경우에만 지정 Workflow를 자동 import·publish한다. 그 전에는 수동 `workflow_dispatch`로만 실행한다.

운영 주소를 Worker에 연결하기 전, 의도하지 않은 외부 입력으로 비용이 발생하지 않도록 Webhook 서명 실패가 `401`을 반환하는지 확인한다. 공개 DNS 주소의 `/healthz/readiness`는 readiness 확인을 위해 공개하며, 편집 화면은 Basic Auth와 n8n owner 인증으로 보호한다. 컨테이너 상태는 서버에서 `docker compose --env-file .env -f compose.prod.yml ps`로 확인한다.

## 배포와 롤백

배포 버튼을 누르면 Workflow export 정적 검증, 파일 복사, 기존 DB와 n8n 데이터 백업, 이미지 pull, Compose 재생성, 컨테이너 healthcheck, 지정 Workflow import·publish, 외부 HTTPS 인증 검사 순서로 실행된다. 배포 전 기존 데이터 volume이 있지만 서비스가 중지돼 있으면 자동 배포는 중단된다. 원인을 확인하고 별도 백업을 만든 뒤 복구한다. n8n이나 PostgreSQL 이미지 버전을 올릴 때에는 릴리스 노트와 DB migration 호환성을 확인하고 백업을 외부 저장소에도 복사한다.

문제가 생기면 이전 Git commit의 `compose.prod.yml`, `Caddyfile`, Workflow JSON을 다시 배포한다. n8n이 DB schema를 변경했다면 이전 이미지만으로 되돌리지 말고 해당 배포 직전의 DB dump와 n8n 데이터 아카이브를 아래 절차로 복구한다. 복구 전 현재 데이터를 별도 보존하고 Worker의 n8n dispatch를 잠시 중단한다.

## 백업과 복구

`scripts/backup-production.sh`는 UTC 타임스탬프가 붙은 PostgreSQL custom dump와 n8n 데이터 volume 아카이브를 `backups/`에 만들고 파일 형식을 검사한다. 배포 직전에 자동 실행된다. 정기 백업은 배포 계정의 crontab에 다음 항목을 추가한다.

```cron
17 3 * * * umask 077; /usr/bin/flock -n /tmp/career-ops-n8n-backup.lock /bin/bash /opt/career-ops-n8n/scripts/backup-production.sh >> /opt/career-ops-n8n/backup.log 2>&1
```

백업 디렉터리와 로그는 배포 계정만 읽을 수 있게 한다. DB dump와 데이터 아카이브에는 Credential 암호문, 실행 관련 데이터, 개인정보가 있을 수 있다. 보존 기간과 여유 디스크를 점검하고, **암호화 키와 백업 파일을 서버 밖의 별도 암호화 저장소에도 복사**한다. 서버 안의 백업만으로는 디스크 손실을 복구할 수 없다. Lightsail 자동 스냅샷은 별도의 보완책이며 비용과 보존 기간을 확인하고 활성화한다.

복구는 새 서버 또는 격리된 환경에서 먼저 연습한다. 원래 `N8N_ENCRYPTION_KEY`를 준비하고, 대상 Compose를 한 번 기동해 volume을 만든 뒤 n8n을 중지한다. 기존 환경에서 복구한다면 현재 데이터를 별도 백업한다. 아래 명령은 대상 DB와 n8n 데이터 volume을 덮어쓰므로 파일명·대상 환경을 먼저 확인한다.

```bash
cd /opt/career-ops-n8n
docker compose --env-file .env -f compose.prod.yml stop n8n
docker compose --env-file .env -f compose.prod.yml exec -T postgres \
  pg_restore -U n8n -d n8n --clean --if-exists < backups/n8n-YYYYMMDDTHHMMSSZ.dump
docker run --rm \
  -v blog-career-ops-n8n_n8n_data:/data \
  -v "$PWD/backups:/backup:ro" \
  alpine:3.21 sh -c 'cd /data && tar -xzf /backup/n8n-YYYYMMDDTHHMMSSZ.data.tar.gz --strip-components=1 && chown -R 1000:1000 /data'
docker compose --env-file .env -f compose.prod.yml start n8n
```

복구 후 owner 로그인, Credential 복호화, 게시 Workflow, Webhook 서명과 Worker callback을 확인한다. 복구 훈련이 끝나기 전에는 복구 가능성을 확정하지 않는다.

## 참고 문서

- [n8n reverse proxy 설정](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/configure-webhook-urls-with-reverse-proxy.md)
- [Caddy 자동 HTTPS](https://caddyserver.com/docs/automatic-https)
- [Lightsail 정적 IP](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-static-ip-addresses-in-amazon-lightsail.html)
- [Lightsail 방화벽](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html)
- [GitHub Actions 환경](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
