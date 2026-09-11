# 취업 준비 관리·자동화 확장 프로젝트 계획

> 기준일: 2026-09-11
> 작업 브랜치: `codex/career-ops-foundation`  
> 현재 범위: 2단계(프로젝트 골격과 공통 계약 구성) 완료

## 1. 프로젝트 정의

기존 개인 기술 블로그를 유지하면서, 실제 취업 준비에 계속 사용할 수 있는 1인용 관리자 서비스를 추가한다. 채용공고 등록부터 원문 수집, AI 분석, 이력서·포트폴리오 비교, 면접 질문 생성, 지원 상태 및 회고 관리까지 하나의 흐름으로 연결한다.

이 프로젝트의 목적은 단순한 기술 데모가 아니다.

- 반복되는 채용공고 분석과 면접 준비 시간을 줄인다.
- 분석 근거와 지원 이력을 누적해 다음 지원 품질을 높인다.
- Next.js, Cloudflare Workers, n8n, Docker, PostgreSQL/Supabase, AI API를 실제 운영 흐름으로 연결한다.
- 인증, 요청 검증, 비동기 처리, 재시도, 멱등성, 로그, 알림까지 포함한 운영 경험을 만든다.
- 구현 선택과 장애 대응 과정을 기술 블로그 및 포트폴리오 사례로 설명할 수 있게 한다.

### MVP 성공 기준

관리자가 Wanted 채용공고 URL을 등록하면 다음 결과가 비동기로 생성되고 관리자 화면에서 다시 조회되어야 한다.

1. 공고 기본 정보와 정리된 원문
2. 자격요건, 우대사항, 기술 스택, 인재상
3. 현재 이력서·포트폴리오와의 적합도 및 근거
4. 부족한 역량과 준비 액션
5. 예상 면접 질문
6. 처리 상태와 실패 사유
7. 완료 또는 실패 Slack 알림

## 2. 확정한 기술 및 운영 결정

| 영역            | 선택                                   | 이유                                                      |
| --------------- | -------------------------------------- | --------------------------------------------------------- |
| 웹 애플리케이션 | 기존 `apps/blog`의 Next.js             | 공개 블로그와 관리자 화면의 디자인·코드 재사용            |
| 웹 배포         | 기존 Vercel 유지                       | 현재 배포 흐름을 보존하고 Cloudflare Pages 중복 도입 방지 |
| API Gateway     | `apps/worker`의 Cloudflare Worker      | 관리자 인증, 검증, 멱등성, Rate Limit, n8n 은닉           |
| 자동화          | `apps/n8n`의 Docker Compose 기반 n8n   | 로컬 무료 개발 후 운영 호스팅은 사용량을 보고 결정        |
| 데이터베이스    | Supabase PostgreSQL                    | Auth, PostgreSQL, Storage를 한 서비스에서 시작            |
| 인증            | Supabase Auth, 관리자 1명              | 브라우저에 비밀번호를 포함하지 않고 확장 가능한 세션 사용 |
| AI              | OpenAI Responses API + `gpt-5.6-terra` | 구조화 출력과 분석 품질을 우선                            |
| 알림            | Slack Incoming Webhook                 | 비동기 완료·실패를 기다리지 않고 확인                     |
| 최초 공고 소스  | Wanted                                 | MVP 파서와 검증 범위를 한 사이트로 제한                   |
| 공유 계약       | `packages/contracts`                   | Next.js, Worker, n8n 입출력 형식의 불일치 방지            |

### MVP에서 하지 않는 것

- 다중 사용자, 조직, 권한 역할 관리
- 채용 사이트 다중 지원 및 대량 크롤링
- 브라우저 자동화나 CAPTCHA·접근 제한 우회
- AI가 지원 여부를 자동 결정하거나 자동 지원하는 기능
- n8n 운영 서버의 조기 확정
- Cloudflare Pages로 Next.js 이전
- 복잡한 메시지 큐 도입

## 3. 목표 아키텍처

```text
[Browser]
   │ Supabase 로그인/JWT
   ▼
[Next.js on Vercel]
   │ HTTPS + Bearer token + Idempotency-Key
   ▼
[Cloudflare Worker API Gateway]
   ├─ Origin/JWT/관리자/요청 스키마 검증
   ├─ Request ID, Rate Limit, 멱등성, 오류 표준화
   ├─ Supabase에 작업 생성·상태 조회
   └─ 서명된 요청으로 n8n Webhook 호출
                     │
                     ▼
              [n8n in Docker]
               ├─ Wanted 원문 수집 또는 수동 원문 사용
               ├─ 본문 정규화
               ├─ OpenAI 구조화 분석
               ├─ 이력서·포트폴리오와 비교
               ├─ Worker 내부 콜백으로 결과 저장
               └─ Slack 완료/실패/입력 필요 알림
                     │
                     ▼
            [Supabase DB / Storage]
```

### 책임 경계

- Next.js는 화면, 사용자 입력, 인증 세션 이용, 상태 조회를 담당한다.
- Worker는 인터넷에 노출되는 유일한 자동화 API 입구이며 긴 AI 작업을 직접 수행하지 않는다.
- n8n은 오케스트레이션, 수집, AI 호출, 재시도, Slack 알림을 담당한다.
- Supabase는 시스템의 최종 상태와 결과를 보관하는 기준 데이터 저장소다.
- Slack은 알림 수단일 뿐 작업 상태의 기준 저장소가 아니다.

### 비동기 요청 흐름

1. Next.js가 Worker에 분석 작업 생성을 요청한다.
2. Worker가 인증·입력·멱등성 검증 후 `analysis_jobs`에 `queued` 작업을 만든다.
3. Worker가 n8n Webhook을 짧은 제한 시간으로 호출하고 즉시 `202 Accepted`와 작업 ID를 반환한다.
4. n8n이 단계별 상태를 Worker 내부 콜백으로 갱신한다.
5. 관리자 화면은 작업 상태를 폴링한다. MVP 이후 필요할 때 Realtime/SSE를 검토한다.
6. 성공·실패·수동 입력 필요 시 Slack에 관리자 화면 링크를 전송한다.

## 4. 목표 저장소 구조

```text
.
├── apps/
│   ├── blog/                 # 기존 Next.js 블로그 + 공개/관리자 화면
│   ├── worker/               # Cloudflare Worker API Gateway
│   └── n8n/                  # Docker Compose, n8n 운영 문서, workflow export
├── packages/
│   ├── contracts/            # API 요청/응답, AI 결과, 상태 enum, 오류 스키마
│   └── ui/                   # 기존 공유 UI
├── supabase/
│   ├── migrations/           # DB 스키마, 함수, RLS 정책
│   └── seed.sql              # 로컬 개발용 최소 시드(비밀·실데이터 제외)
└── CAREER_OPS_PLAN.md        # 이 문서
```

`apps/n8n`에는 애플리케이션 코드 대신 n8n을 재현 가능하게 실행하기 위한 구성을 둔다.

- `compose.yml`
- `.env.example`
- `workflows/*.json`
- `README.md`
- 필요할 경우 버전이 고정된 커스텀 이미지용 `Dockerfile`
- 자격 증명 파일, 암호화 키, 실행 데이터, PostgreSQL volume은 커밋하지 않는다.

## 5. 단계별 실행 계획

각 단계는 바로 다음 단계가 의존하는 최소 결과를 만든다. 체크박스는 구현과 검증을 모두 마친 후에만 완료 처리한다.

### 1단계 — 기존 블로그와 배포 기준선 점검 `완료`

목표: 기능 추가 전 현재 구조, 빌드 상태, 배포 전제, 민감 파일 위험을 기록한다.

- [x] 모노레포, 패키지 관리자, Next.js 버전과 앱 구조 확인
- [x] 현재 Vercel 배포 전제 및 `NEXT_PUBLIC_CLIENT_URL` 사용 확인
- [x] 기존 API Route와 공개 파일 구조 확인
- [x] Worker, Supabase, Docker Compose, CI 설정이 아직 없음을 확인
- [x] 타입 검사, lint, production build 기준선 실행
- [x] 이력서·포트폴리오 PDF 위치와 Git 추적 상태 확인

검증 결과:

- `pnpm --filter blog typecheck`: 통과
- `pnpm --filter blog lint`: 오류 없이 통과, 기존 import 정렬 경고 24건
- `NEXT_PUBLIC_CLIENT_URL=https://blog.story-dict.com pnpm --filter blog build`: 통과, 정적 페이지 101개 생성
- 현재 Next.js `15.5.10`, React `19`, pnpm `10.4.1`, 요구 Node.js `>=20`
- `next lint`가 Next.js 16에서 제거된다는 기존 경고가 있어 이후 ESLint CLI 전환 작업을 별도 기술부채로 기록
- `/apps/blog/public/pdfs`는 현재 Git 미추적 상태다. 공개 저장소에 추가하기 전에 전화번호, 주소, 이메일 등 개인정보 공개 범위를 반드시 확인한다.

종료 기준: 기존 앱을 수정하지 않은 상태에서 검증 결과와 위험 요소가 문서화되어 있다.

### 2단계 — 프로젝트 골격과 공통 계약 구성

목표: 앱 간 경계를 코드 구조로 만들고 모든 서비스가 같은 계약을 사용하게 한다.

- [x] `apps/worker`, `apps/n8n`, `packages/contracts`, `supabase/migrations` 생성
- [x] Worker는 TypeScript, Wrangler, Hono, Cloudflare Vitest plugin을 기존 모노레포 규칙에 맞게 구성
- [x] 공통 상태 enum, API 오류, Request ID, 분석 요청·응답 타입 정의
- [x] AI 분석 결과 JSON Schema와 런타임 검증 스키마 정의
- [x] `.gitignore`, 비밀값·환경별 외부 주소만 포함한 각 앱의 `.env.example`, 로컬 실행 문서 추가
- [x] 루트 Turbo 작업에 check-types/lint/test/build 연결

검증 결과:

- `pnpm install --force`: 통과. 신규 Hono, Wrangler, Zod, Vitest 의존성 설치
- `pnpm --filter @workspace/contracts generate-schemas`: 통과. JSON Schema 4개 생성
- `pnpm --filter worker generate-types`: 통과. `worker-configuration.d.ts` 생성
- `pnpm --filter worker check-generated-types`: 통과. 생성 타입 최신 상태 확인
- `pnpm check-types`: 통과. constants, contracts, blog, worker 검사
- `pnpm lint`: 통과. 기존 블로그 import 정렬 경고만 유지
- `pnpm test`: 통과. contracts 5개, Worker 5개 테스트
- `NEXT_PUBLIC_CLIENT_URL=http://localhost:3000 pnpm build`: 통과. 블로그 정적 페이지 101개와 Worker Wrangler dry-run build 확인
- `GET http://localhost:8787/health`: Worker 로컬 실행 시 확인할 수 있는 liveness 응답과 Request ID 계약 완성

종료 기준: 비밀값 없이 의존성 설치, 계약 테스트, Worker 런타임 테스트, 전체 타입 검사와 build가 통과한다.

### 3단계 — 공개 이력서·포트폴리오 화면

목표: 기존 블로그 디자인을 유지하며 공개 자료를 탐색 가능한 페이지로 제공한다.

- [ ] PDF 개인정보와 공개 범위를 직접 검토하고 공개 가능한 파일만 확정
- [ ] 파일명을 URL 친화적인 영문 이름으로 복제 또는 교체할지 결정
- [ ] `/resume`, `/portfolio` 페이지 구현
- [ ] PDF 보기, 새 탭 열기, 다운로드, 모바일 fallback 제공
- [ ] 메타데이터, sitemap, 내비게이션, 접근성 확인
- [ ] 외부 검색 노출 여부와 PDF 캐시 정책 결정

종료 기준: 데스크톱·모바일에서 두 문서를 볼 수 있고 비공개 정보가 의도치 않게 노출되지 않는다.

### 4단계 — Supabase 프로젝트·스키마·RLS

목표: 관리자 1명의 인증과 취업 준비 데이터를 안전하게 저장한다.

- [ ] Supabase 프로젝트 생성 및 개발/운영 지역 결정
- [ ] 관리자 이메일 계정 1개 생성, 공개 회원가입 차단
- [ ] 아래 데이터 모델을 migration으로 구현
- [ ] 모든 공개 스키마 테이블에 RLS 활성화
- [ ] 관리자 UUID만 읽기·쓰기 가능한 정책 작성
- [ ] Worker 전용 Secret key 사용 범위 최소화
- [ ] Storage 공개/비공개 bucket과 접근 정책 결정
- [ ] migration 적용/되돌리기/로컬 seed 절차 문서화

종료 기준: 익명 사용자는 관리자 데이터를 읽지 못하고, 관리자와 Worker만 허용된 작업을 수행한다.

### 5단계 — 관리자 인증과 관리자 셸

목표: 브라우저 코드에 비밀번호를 넣지 않고 `/admin` 전체를 보호한다.

- [ ] Supabase SSR 인증 클라이언트 구성
- [ ] 로그인, 로그아웃, 세션 갱신 구현
- [ ] `/admin` 레이아웃과 기존 블로그 디자인 토큰 재사용
- [ ] 미인증 사용자의 관리자 Route 접근 차단
- [ ] 로그인 사용자의 UUID가 `ADMIN_USER_ID`와 일치하는지 서버/Worker 양쪽에서 확인
- [ ] 로그인 오류, 만료, 네트워크 장애 UI 구현
- [ ] 관리자 페이지와 민감 응답에 `noindex`, 적절한 cache-control 적용

종료 기준: 허용된 한 계정만 관리자 화면과 Worker API를 사용할 수 있다.

### 6단계 — 지원 공고 및 지원 상태 CRUD

목표: AI 없이도 기본 지원 관리 도구로 사용할 수 있게 한다.

- [ ] 회사, 공고 URL, 제목, 지원 상태, 지원일, 면접일 입력 폼
- [ ] 목록 검색·필터·정렬 및 상세 화면
- [ ] 상태 변경 이력 저장
- [ ] 메모 저장 및 수정 시간 표시
- [ ] URL 중복 경고와 동일 공고 재지원 정책 구현
- [ ] 삭제는 기본적으로 soft delete 또는 archive 처리

종료 기준: 공고 등록부터 상태 변경과 회고 기록까지 수동으로 안정적으로 사용할 수 있다.

### 7단계 — Cloudflare Worker API Gateway

목표: n8n Webhook을 숨기고 외부 요청의 보안·정합성을 한곳에서 처리한다.

- [ ] 허용 Origin 목록과 CORS 구현
- [ ] Supabase JWT를 JWKS로 검증하고 관리자 UUID 확인
- [ ] 요청 body 크기, Content-Type, URL, UUID, enum, 날짜 검증
- [ ] `X-Request-Id` 생성·전파 및 구조화 로그 작성
- [ ] `Idempotency-Key` 저장과 같은 요청의 중복 실행 방지
- [ ] Cloudflare Rate Limiting binding 또는 동등한 저장소 기반 제한 구현
- [ ] n8n 요청에 timestamp, request ID, HMAC 서명 추가
- [ ] 표준 오류 envelope와 upstream timeout 처리
- [ ] 공개 API와 `/v1/internal/*` 콜백 API 분리

종료 기준: 인증되지 않은 요청, 재전송 공격, 중복 요청, 잘못된 입력이 차단되고 정상 요청은 추적 가능하다.

### 8단계 — 로컬 n8n Docker 환경

목표: 클라우드 비용 없이 재현 가능한 자동화 개발 환경을 만든다.

- [ ] n8n과 전용 PostgreSQL의 Docker Compose 작성
- [ ] 이미지 버전, 포트, 시간대, DB 이름과 실행 기록 정책을 Compose에 고정하고 healthcheck 추가
- [ ] volume, 네트워크, 재시작 정책 구성
- [ ] `.env`에는 암호화 키, DB 비밀번호, 공유 Secret, 환경별 URL·ID만 보관
- [ ] OpenAI API Key와 Slack Bot Token은 n8n Credentials에 암호화해 보관
- [ ] n8n 암호화 키와 owner 계정 로컬 설정
- [ ] export한 workflow JSON을 Git으로 버전 관리
- [ ] n8n UI와 Webhook을 인터넷에 직접 공개하지 않는 기본 구성
- [ ] 실제 외부 Webhook 시험이 필요할 때만 임시 Cloudflare Tunnel 사용

종료 기준: `docker compose up`으로 재시작 가능한 로컬 n8n과 영속 DB가 실행되고 샘플 Webhook이 동작한다.

### 9단계 — Wanted 공고 수집과 수동 fallback

목표: Wanted URL에서 분석 가능한 본문을 얻되 수집 실패가 전체 기능을 막지 않게 한다.

- [ ] `https://www.wanted.co.kr/wd/{숫자}` 형식만 허용하고 canonical URL 생성
- [ ] redirect, timeout, 응답 크기, Content-Type 제한
- [ ] localhost, 사설 IP, link-local 등 SSRF 대상 차단
- [ ] 공식적으로 노출된 HTML/구조화 데이터에서 제목, 회사, 본문 추출
- [ ] 공고 ID와 수집 시각, 원문 hash, parser version 저장
- [ ] 본문 정규화 시 섹션과 원문 근거 위치 보존
- [ ] 로그인, 차단, 만료, 구조 변경을 구분한 오류 코드 정의
- [ ] 실패 시 사용자가 공고 본문을 직접 붙여 넣어 재개하는 UI 구현
- [ ] 접근 제한 우회·CAPTCHA 해결·과도한 반복 요청은 구현하지 않음

종료 기준: 지원되는 Wanted 공고는 자동 수집되고, 실패한 공고도 수동 원문으로 동일 분석 흐름을 완료한다.

### 10단계 — 이력서·포트폴리오 버전 및 검색용 텍스트

목표: 분석 시점에 사용한 내 자료를 고정하고 결과를 재현할 수 있게 한다.

- [ ] 기존 PDF를 첫 `resume_versions`, `portfolio_versions`로 등록
- [ ] 공개 원본과 분석용 비공개 원본의 저장 정책 결정
- [ ] PDF 텍스트 추출 후 사람이 검수·수정할 수 있는 편집 화면 제공
- [ ] 버전명, 생성일, 활성 여부, 파일 hash 저장
- [ ] 분석 작업이 특정 자료 버전 ID를 참조하도록 고정
- [ ] 새 버전 등록 후 이전 분석을 자동 변경하지 않음

종료 기준: 각 분석이 어떤 이력서와 포트폴리오 버전을 사용했는지 추적 가능하다.

### 11단계 — OpenAI 구조화 분석 Workflow

목표: 공고와 개인 자료를 근거 기반의 안정적인 JSON 결과로 변환한다.

- [ ] 1차 호출에서 공고의 사실 정보만 추출
- [ ] 2차 호출에서 개인 자료와 비교하고 적합도·격차·질문 생성
- [ ] Responses API Structured Outputs와 공통 JSON Schema 사용
- [ ] OpenAI API Key는 환경변수가 아니라 n8n Credentials로 연결
- [ ] 모든 주장에 공고 또는 개인 자료의 근거 snippet/section 연결
- [ ] `unknown`과 추론을 명시하고 없는 경험을 생성하지 않도록 프롬프트 설계
- [ ] model, prompt version, schema version, token 사용량, latency 저장
- [ ] 입력 길이 제한, 문서 trimming, timeout, 재시도, 비용 상한 구현
- [ ] 응답 스키마 불일치 시 제한된 횟수로 자동 복구
- [ ] 평가용 실제 공고 fixture와 기대 필드 검사 작성

종료 기준: 같은 입력의 결과가 스키마를 항상 만족하며 UI가 임의 텍스트 파싱 없이 렌더링한다.

### 12단계 — 비동기 상태·콜백·재시도

목표: 긴 작업을 안전하게 추적하고 장애 후에도 중복 없이 재개한다.

- [ ] 작업 상태 머신과 허용 전이 검증
- [ ] n8n → Worker 콜백 timestamp/HMAC 검증
- [ ] 단계별 heartbeat와 `last_error_code` 저장
- [ ] 네트워크/429/5xx만 지수 backoff와 jitter로 재시도
- [ ] 인증/검증/지원하지 않는 공고 오류는 자동 재시도하지 않음
- [ ] 부분 결과의 원자적 저장 또는 revision 규칙 구현
- [ ] 동일 callback event ID 중복 처리 방지
- [ ] 관리자 수동 재시도와 취소 동작 구현
- [ ] 오래 멈춘 작업을 탐지하는 기준 정의

종료 기준: 새로고침·중복 클릭·일시 장애에도 작업이 중복 생성되지 않고 최종 상태가 일관된다.

### 13단계 — 분석 결과 및 면접 준비 화면

목표: 결과를 실제 지원 준비 행동으로 연결한다.

- [ ] 요약, 요구사항, 우대사항, 기술 스택을 섹션별 표시
- [ ] 적합도는 단일 숫자뿐 아니라 충족·부분·미충족 근거와 함께 표시
- [ ] 부족 역량을 중요도와 준비 액션으로 정렬
- [ ] 예상 질문별 질문 의도, 근거, 답변 초안 입력란 제공
- [ ] 면접 전 체크리스트와 면접 후 회고 저장
- [ ] 이전 분석·자료 버전·프롬프트 버전 비교
- [ ] AI 결과를 사용자가 수정하거나 메모할 수 있게 하되 원본 결과 보존

종료 기준: 분석 결과 확인부터 답변 작성과 면접 회고까지 관리자 화면에서 이어진다.

### 14단계 — Slack 단계 알림

목표: 화면을 계속 보고 있지 않아도 의미 있는 상태 변화를 알 수 있게 한다.

- [ ] 공고 알림용 `#채용공고`와 장애 알림용 `#시스템-에러` 채널 생성
- [ ] 공고 채널은 Bot API로 공고마다 루트 메시지를 한 번만 생성
- [ ] 공고 등록, 분석 완료, 지원 상태, 면접 관련 알림은 해당 공고의 스레드에 기록
- [ ] Bot API 응답의 channel ID와 message `ts`를 공고 데이터에 저장해 스레드 재사용
- [ ] 시스템 에러 채널은 권한이 제한된 Incoming Webhook으로 Worker와 n8n이 함께 사용
- [ ] 알림 본문에 환경, 회사/공고, 작업 ID, 상태, 경과 시간, 관리자 링크 포함
- [ ] 성공 메시지는 요약과 핵심 부족 역량만 포함하고 전체 개인정보는 제외
- [ ] 실패 메시지는 오류 코드, 실패 단계, 재시도 여부 포함
- [ ] Slack 실패가 본 작업을 실패시키지 않도록 분리
- [ ] 같은 event ID의 중복 알림 방지
- [ ] Slack 메시지나 스레드 답글을 읽는 Events API 연동은 MVP 범위에서 제외

알림 기준:

| 이벤트                        | 대상                       | 담당          |
| ----------------------------- | -------------------------- | ------------- |
| 공고 등록·분석 접수           | 공고 채널의 새 루트 메시지 | n8n           |
| 공고 수집·분석 완료           | 해당 공고 메시지의 스레드  | n8n           |
| 지원 상태·면접 준비 알림      | 해당 공고 메시지의 스레드  | n8n           |
| 자동 수집 실패·수동 입력 필요 | 시스템 에러 채널           | n8n           |
| 재시도 시작·최종 실패         | 시스템 에러 채널           | n8n           |
| Worker가 n8n 호출 자체에 실패 | 시스템 에러 채널           | Worker        |
| 면접 일정 임박                | 해당 공고 스레드, MVP 이후 | 예약 Workflow |

종료 기준: 완료·실패·사용자 조치 필요 이벤트가 중복 없이 Slack에 도착한다.

### 15단계 — 테스트·보안·관측성 강화

목표: 포트폴리오 데모가 아니라 지속 사용 가능한 품질을 확보한다.

- [ ] 계약 스키마와 상태 전이 단위 테스트
- [ ] Worker 인증, CORS, SSRF, HMAC, 멱등성, Rate Limit 테스트
- [ ] Wanted fixture 기반 parser 회귀 테스트
- [ ] n8n 성공·수집 실패·AI 429·callback 실패 workflow 테스트
- [ ] 민감값 redaction과 로그 구조 검증
- [ ] DB index 및 느린 query 확인
- [ ] n8n workflow export와 Supabase backup 절차 검증
- [ ] 의존성 및 컨테이너 이미지 보안 업데이트 절차 작성
- [ ] 장애 대응 runbook과 수동 복구 절차 작성

종료 기준: 핵심 실패 시나리오를 재현하고 로그만으로 작업 ID 기준 원인을 추적할 수 있다.

### 16단계 — 배포·실사용·포트폴리오화

목표: 최소 운영비로 배포하고 실제 지원 과정에서 개선 근거를 수집한다.

- [ ] Vercel에 Next.js 환경변수와 관리자 redirect URL 설정
- [ ] Cloudflare Worker 개발/운영 환경 분리 및 secret 등록
- [ ] n8n 운영 위치는 로컬 사용량·안정성 측정 후 결정
- [ ] 운영 n8n 선택 시 Docker, HTTPS, 방화벽, backup, update 정책 적용
- [ ] 실제 공고 5개 이상으로 사용성·비용·실패율 측정
- [ ] 개인정보 제거 후 아키텍처, 트레이드오프, 장애 대응 내용을 사례로 작성
- [ ] README에 로컬 실행, 테스트, 배포, 시스템 흐름 추가

종료 기준: 실지원 데이터로 안정적으로 사용하며, 구현과 운영 판단을 근거와 함께 설명할 수 있다.

## 6. 데이터 모델 초안

모든 주요 테이블은 `id uuid`, `created_at timestamptz`, `updated_at timestamptz`를 기본으로 사용한다. 사용자 소유 데이터에는 `owner_id uuid`를 두고 단일 관리자 UUID로 RLS를 적용한다.

### 핵심 엔터티

| 테이블                       | 핵심 필드                                                                                                                                             | 비고                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `companies`                  | `name`, `website_url`, `notes`                                                                                                                        | 같은 회사의 여러 공고 연결     |
| `job_postings`               | `company_id`, `source`, `external_id`, `canonical_url`, `title`, `status`, `slack_channel_id`, `slack_thread_ts`                                      | `(source, external_id)` unique |
| `job_posting_snapshots`      | `job_posting_id`, `raw_content`, `normalized_content`, `content_hash`, `parser_version`, `fetched_at`                                                 | 공고 변경과 분석 재현성        |
| `applications`               | `job_posting_id`, `status`, `applied_at`, `interview_at`, `archived_at`                                                                               | 현재 지원 상태                 |
| `application_status_history` | `application_id`, `from_status`, `to_status`, `changed_at`, `note`                                                                                    | 상태 변경 감사 이력            |
| `resume_versions`            | `label`, `storage_path`, `content_hash`, `extracted_text`, `is_active`                                                                                | 분석 시 특정 버전 참조         |
| `portfolio_versions`         | `label`, `storage_path`, `content_hash`, `extracted_text`, `is_active`                                                                                | 분석 시 특정 버전 참조         |
| `analysis_jobs`              | `job_posting_id`, `resume_version_id`, `portfolio_version_id`, `status`, `stage`, `request_id`, `idempotency_key`, `attempt_count`, `last_error_code` | 비동기 작업 기준 상태          |
| `analysis_job_events`        | `analysis_job_id`, `event_id`, `event_type`, `payload`, `occurred_at`                                                                                 | callback 멱등성·타임라인       |
| `analysis_results`           | `analysis_job_id`, `schema_version`, `prompt_version`, `model`, `result jsonb`, `usage jsonb`                                                         | 원본 구조화 결과 보존          |
| `interview_questions`        | `analysis_result_id`, `category`, `question`, `intent`, `evidence`, `priority`                                                                        | 생성 질문                      |
| `interview_answers`          | `question_id`, `answer`, `revision`, `is_current`                                                                                                     | 답변 수정 이력                 |
| `interview_notes`            | `application_id`, `interviewed_at`, `round`, `content`, `lessons`                                                                                     | 면접 회고                      |
| `audit_events`               | `actor_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`                                                                            | 민감값 제외 운영 추적          |

### 상태 enum

- 지원 상태: `interested`, `preparing`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`, `archived`
- 작업 상태: `queued`, `running`, `needs_input`, `retrying`, `succeeded`, `failed`, `cancelled`
- 작업 단계: `dispatching`, `fetching`, `normalizing`, `extracting`, `matching`, `generating_questions`, `saving`, `notifying`

### 주요 제약과 인덱스

- `job_postings(source, external_id)` unique
- `analysis_jobs(owner_id, idempotency_key)` partial unique
- `analysis_job_events(event_id)` unique
- `analysis_jobs(status, updated_at)` index
- `applications(status, interview_at)` index
- 결과 JSON에는 UI가 자주 조회하는 모든 필드를 넣기보다 검색·정렬 대상은 정규 컬럼으로 분리
- 실제 삭제 대신 archive를 기본으로 하고 민감 데이터 완전 삭제 절차를 별도로 제공

## 7. API 계약 초안

### 공개 관리자 API

| Method  | Path                           | 역할                           |
| ------- | ------------------------------ | ------------------------------ |
| `POST`  | `/v1/job-postings`             | Wanted URL 또는 수동 원문 등록 |
| `GET`   | `/v1/job-postings`             | 공고 목록 조회                 |
| `GET`   | `/v1/job-postings/:id`         | 공고 상세 조회                 |
| `POST`  | `/v1/analysis-jobs`            | 비동기 분석 작업 생성          |
| `GET`   | `/v1/analysis-jobs/:id`        | 작업 상태와 결과 조회          |
| `POST`  | `/v1/analysis-jobs/:id/retry`  | 실패 작업 수동 재시도          |
| `POST`  | `/v1/analysis-jobs/:id/cancel` | 가능한 단계에서 작업 취소      |
| `PATCH` | `/v1/applications/:id`         | 지원 상태·일정 수정            |

작업 생성 요청에는 `Authorization: Bearer <Supabase access token>`과 `Idempotency-Key`가 필요하다. 응답은 `202 Accepted`와 `jobId`, `requestId`, `statusUrl`을 반환한다.

### 내부 n8n 콜백 API

| Method | Path                            | 역할                              |
| ------ | ------------------------------- | --------------------------------- |
| `POST` | `/v1/internal/analysis-events`  | 단계 변경, heartbeat, 실패 이벤트 |
| `POST` | `/v1/internal/analysis-results` | 최종 결과 원자적 저장             |

내부 요청에는 `X-Request-Id`, `X-Event-Id`, `X-Signature-Timestamp`, `X-Signature`가 필요하다. 서명 대상은 최소 `timestamp + method + path + body hash`이며 허용 시간 차이를 제한한다.

### 표준 오류 응답

```json
{
  "error": {
    "code": "JOB_POSTING_FETCH_BLOCKED",
    "message": "채용공고를 자동으로 불러오지 못했습니다.",
    "retryable": false,
    "requestId": "req_...",
    "details": {
      "action": "PASTE_JOB_POSTING_TEXT"
    }
  }
}
```

오류 메시지에는 비밀값, upstream 원문 응답, 전체 이력서 내용, 내부 stack trace를 포함하지 않는다.

## 8. AI 분석 계약

### 권장 호출 전략

1. **사실 추출 단계**: 공고 원문만 입력해 요구사항·우대사항·기술·인재상과 근거를 구조화한다.
2. **비교 단계**: 1차 결과와 선택한 이력서·포트폴리오 버전을 비교해 충족 여부와 근거를 생성한다.
3. **준비 단계**: 확인된 격차와 역할 요구사항을 기반으로 면접 질문과 준비 액션을 만든다.

한 번의 거대한 프롬프트보다 단계를 분리해 원문 사실과 개인 평가가 섞이는 것을 줄이고, 실패한 단계만 재시도한다.

### 결과 필수 원칙

- 적합도는 참고 지표이며 채용 가능성으로 표현하지 않는다.
- 기술별 `matched`, `partial`, `missing`, `unknown`을 구분한다.
- 공고와 개인 자료에 없는 사실을 생성하지 않는다.
- 각 평가에는 근거 출처와 짧은 근거 텍스트를 연결한다.
- 프롬프트·스키마·모델 버전을 결과와 함께 저장한다.
- AI API에 보내기 전 공개 분석에 불필요한 개인정보를 제거한다.
- 사용자 입력과 수집 본문을 지시가 아닌 데이터로 경계 처리해 prompt injection 영향을 줄인다.

공식 참고:

- [GPT-5.6 Terra 모델](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API Quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)

## 9. 외부 서비스에서 사용자가 준비할 작업

비밀값은 이 문서나 채팅에 붙여 넣지 않고 각 서비스의 Secret/환경변수 저장소에 직접 등록한다.

### Supabase

- [ ] 새 프로젝트 생성, region과 비용 한도 확인
- [ ] Auth에서 공개 회원가입 비활성화
- [ ] 관리자 이메일 사용자 1명 생성
- [ ] 개발 `http://localhost:3000`과 운영 Vercel URL을 Site URL/Redirect URL에 등록
- [ ] 새 형식 Publishable key(`sb_publishable_...`)와 Secret key(`sb_secret_...`) 생성
- [ ] JWT signing key와 JWKS endpoint 확인
- [ ] migration 적용 후 모든 관리자 테이블의 RLS 확인
- [ ] PDF 저장 시 공개 bucket과 비공개 bucket 중 의도에 맞게 선택

레거시 `anon`, `service_role` 키는 2026년 말 폐기 예정이므로 새 프로젝트에서는 Publishable/Secret 키를 기준으로 한다. Secret key는 RLS를 우회하므로 Worker와 신뢰된 서버에서만 사용한다.

공식 참고: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [JWT/JWKS](https://supabase.com/docs/guides/auth/jwts)

### OpenAI

- [ ] API Platform에서 이 프로젝트 전용 Project 생성
- [ ] 결제 수단, 월 예산, 사용량 알림 설정
- [ ] Project API key 발급
- [ ] 키를 n8n Credentials에 저장하고 `.env`와 workflow export에서는 제외
- [ ] 첫 평가 세트로 품질·token 사용량·건당 비용 측정

### Slack

- [ ] 개인 workspace에 `#채용공고`, `#시스템-에러` 채널 생성
- [ ] Slack App의 Bot에 공고 알림용 `chat:write` 권한을 부여하고 workspace에 설치
- [ ] Bot을 `#채용공고` 채널에 추가하고 Bot Token과 Channel ID 확인
- [ ] Incoming Webhooks를 활성화하고 `#시스템-에러` 전용 Webhook URL 발급
- [ ] n8n Credentials에는 Bot Token을, `.env`에는 공고 Channel ID와 에러 Webhook URL을 등록
- [ ] Worker에는 에러 Webhook URL만 등록해 Bot Token의 노출 범위 제한
- [ ] 메시지 수신이나 대화형 처리를 하지 않으므로 Events API와 Signing Secret은 구성하지 않음
- [ ] Webhook URL 유출 시 즉시 폐기하고 재발급

공고 루트 메시지를 생성할 때 Bot API가 반환하는 `channel`과 `ts`를 저장하고, 이후 알림은 `thread_ts`로 전달한다. Incoming Webhook은 생성 시 선택한 에러 채널에 묶인다. 공식 참고: [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)

### Cloudflare

- [ ] Cloudflare 계정과 Workers 사용 가능 여부 확인
- [ ] 개발/운영 Worker 이름과 custom domain 또는 `workers.dev` URL 결정
- [ ] Wrangler 로그인 또는 배포용 최소 권한 API Token 생성
- [ ] Worker secret은 dashboard 또는 `wrangler secret put`으로 등록
- [ ] Rate Limiting 기능의 Free plan 한도와 현재 지원 방식을 구현 시점에 확인
- [ ] 로컬 n8n 외부 콜백 시험 시 임시 Tunnel 사용 여부 결정

Cloudflare Pages는 이 프로젝트에서 사용하지 않는다. 공식 참고: [Workers 환경변수와 secrets](https://developers.cloudflare.com/workers/configuration/environment-variables/), [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)

### Vercel

- [ ] 기존 프로젝트 연결 상태와 production domain 확인
- [ ] Development/Preview/Production별 환경변수 등록
- [ ] Supabase Auth redirect URL에 preview domain을 허용할지 결정
- [ ] `NEXT_PUBLIC_*` 값은 브라우저에 노출된다는 점을 확인하고 secret을 넣지 않음

공식 참고: [Vercel Environment Variables](https://vercel.com/docs/environment-variables)

### 로컬 Docker/n8n

- [ ] Docker Desktop 또는 호환 Docker Engine 설치·업데이트
- [ ] n8n owner 계정용 이메일과 강한 비밀번호 준비
- [ ] `openssl rand -hex 32` 등으로 n8n 암호화 키와 callback secret을 각각 생성
- [ ] Docker volume backup 위치와 주기 결정
- [ ] 항상 실행되는 운영 환경은 MVP 사용 후 별도 결정

## 10. 환경변수 전체 목록

값을 저장소에 커밋하지 않는다. `.env.example`에는 비밀값 또는 실행 환경마다 달라지는 외부 주소·ID만 포함한다. 포트, 시간대, DB 이름, 보존 정책, 모델 옵션처럼 코드와 함께 버전 관리해야 하는 값은 Compose, Wrangler 설정, Workflow 또는 코드 상수에 둔다. 실제 값은 로컬 `.env.local`/`.dev.vars`, n8n `.env`, n8n Credentials, Vercel/Cloudflare Secret UI에 저장한다.

환경별 예시 파일:

- `apps/blog/.env.example`: Next.js 로컬 환경과 Vercel 등록값
- `apps/worker/.env.example`: 로컬 Worker 환경과 Cloudflare vars/secrets 등록값
- `apps/n8n/.env.example`: n8n에 꼭 필요한 비밀값과 환경별 외부 주소·ID
- `.env.ci.example`: Worker 배포와 Supabase migration 자동화에 필요한 CI 전용값

### `apps/blog/.env.local` / Vercel

| 변수                                   | 공개 여부 | 시점        | 용도                          |
| -------------------------------------- | --------- | ----------- | ----------------------------- |
| `NEXT_PUBLIC_CLIENT_URL`               | 공개      | 기존        | canonical URL과 절대 URL 생성 |
| `NEXT_PUBLIC_SUPABASE_URL`             | 공개      | 인증 단계   | Supabase 프로젝트 URL         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개      | 인증 단계   | 브라우저용 Publishable key    |
| `NEXT_PUBLIC_WORKER_API_URL`           | 공개      | Worker 연동 | Cloudflare Worker base URL    |

브라우저 번들에 포함되므로 `NEXT_PUBLIC_*`에는 Secret key, OpenAI key, Slack URL을 절대 넣지 않는다.

### `apps/worker/.dev.vars` / Cloudflare Worker secrets·vars

| 변수                      | 분류          | 시점     | 용도                                                          |
| ------------------------- | ------------- | -------- | ------------------------------------------------------------- |
| `APP_BASE_URL`            | 환경별 주소   | 초기     | 허용 Origin 검증과 Slack 링크에 사용할 웹 URL                 |
| `SUPABASE_URL`            | 환경별 주소   | 인증     | 서버 측 DB API와 JWT 검증용 JWKS URL의 기준 주소              |
| `SUPABASE_SECRET_KEY`     | **비밀**      | DB 연동  | Worker의 제한된 서버 작업용 Secret key                        |
| `ADMIN_USER_ID`           | **비밀 취급** | 인증     | 허용할 Supabase 사용자 UUID 1개                               |
| `N8N_WEBHOOK_URL`         | **비밀 취급** | n8n 연동 | 외부에 노출하지 않을 n8n workflow URL                         |
| `N8N_WEBHOOK_SECRET`      | **비밀**      | n8n 연동 | Worker → n8n HMAC 서명 키                                     |
| `N8N_CALLBACK_SECRET`     | **비밀**      | callback | n8n → Worker HMAC 검증 키                                     |
| `SLACK_ERROR_WEBHOOK_URL` | **비밀**      | 알림     | Worker 자체 dispatch 실패를 시스템 에러 채널에 알리는 Webhook |

Worker는 `APP_BASE_URL`의 Origin만 허용하고, JWKS 주소는 `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`으로 조합한다. n8n 요청 timeout은 코드 상수, 알림 활성 여부와 로그 수준은 코드 기본값으로 관리한다. 로컬 Worker에서는 `.dev.vars`와 `.env`를 동시에 사용하지 않으며 운영 비밀값은 Wrangler 설정 파일의 평문 `vars`에 두지 않는다.

### `apps/n8n/.env` — 필수 환경변수

| 변수                      | 분류          | 용도                                                     |
| ------------------------- | ------------- | -------------------------------------------------------- |
| `N8N_ENCRYPTION_KEY`      | **비밀**      | n8n Credentials 암호화, 최초 설정 후 변경 금지           |
| `POSTGRES_PASSWORD`       | **비밀**      | n8n 전용 PostgreSQL 접속 비밀번호                        |
| `APP_BASE_URL`            | 환경별 주소   | Slack 알림의 관리자 화면 링크 생성                       |
| `WORKER_CALLBACK_URL`     | 환경별 주소   | n8n이 진행 상태와 결과를 반환할 Worker 내부 API          |
| `WORKER_CALLBACK_SECRET`  | **비밀**      | n8n → Worker callback HMAC 서명 키                       |
| `WORKER_TO_N8N_SECRET`    | **비밀**      | Worker → n8n Webhook HMAC 검증 키                        |
| `SLACK_JOB_CHANNEL_ID`    | 환경별 ID     | 공고별 루트 메시지를 생성할 Slack 채널                   |
| `SLACK_ERROR_WEBHOOK_URL` | **비밀 주소** | Worker와 n8n의 시스템 오류를 받을 Slack Incoming Webhook |

`OPENAI_API_KEY`와 `SLACK_BOT_TOKEN`은 n8n Credentials에 저장하고 workflow export에는 값이 포함되지 않는지 확인한다.

### Compose·Workflow·코드에 고정할 설정

- Compose: n8n 이미지 버전, `5678` 포트, 로컬 HTTP, `Asia/Seoul` 시간대
- Compose: PostgreSQL DB 이름·사용자·host·port·schema와 `${POSTGRES_PASSWORD}` 연결
- Compose: 실행 기록 pruning, 보존 기간, 성공·실패·수동 실행 저장 정책
- Workflow/계약: AI 모델, reasoning effort, prompt version, 최대 출력 token
- Workflow/코드: Wanted fetch timeout과 최대 응답 크기
- Workflow: Slack 알림 활성 여부와 메시지 라우팅
- 운영 배포 시에만 n8n 공개 host, HTTPS URL, secure cookie, proxy 설정을 추가

### CI/CD에서만 필요한 변수

| 변수                    | 분류     | 필요 조건                       |
| ----------------------- | -------- | ------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | 일반     | CI에서 Worker 배포 시           |
| `CLOUDFLARE_API_TOKEN`  | **비밀** | CI에서 최소 권한 Worker 배포 시 |
| `SUPABASE_ACCESS_TOKEN` | **비밀** | CI에서 migration 적용 시        |
| `SUPABASE_PROJECT_REF`  | 일반     | 원격 Supabase 연결 시           |
| `SUPABASE_DB_PASSWORD`  | **비밀** | CI/CLI에서 원격 migration 시    |

Vercel은 기존 Git Integration 배포를 유지하므로 별도 CLI token, org ID, project ID를 관리하지 않는다. CI 자동화 자체를 도입하기 전에는 이 파일의 값도 실제로 발급하거나 등록할 필요가 없다.

## 11. 보안 및 운영 원칙

- n8n Webhook URL과 n8n editor를 최종 사용자에게 직접 노출하지 않는다.
- 브라우저 인증만 믿지 않고 Worker에서 JWT signature, issuer, expiry, 관리자 UUID를 검증한다.
- Supabase Secret key는 브라우저와 Next.js client component에 절대 전달하지 않는다.
- Wanted URL fetch는 SSRF 방어와 응답 제한을 먼저 적용한다.
- 수집한 공고 문구와 PDF 텍스트는 prompt instruction으로 실행되지 않게 데이터 경계를 명확히 한다.
- Request ID를 Next.js → Worker → n8n → OpenAI 결과 → Slack까지 전파한다.
- 모든 retry는 멱등성을 전제로 하고 retry 가능한 오류만 대상으로 한다.
- 로그에는 token, cookie, Authorization header, Webhook URL, PDF 전체 텍스트를 남기지 않는다.
- 공개 PDF와 비공개 분석 텍스트의 저장 및 삭제 정책을 분리한다.
- 배포 전 secret rotation, DB backup 복원, workflow export 복구를 각각 한 번 시험한다.

## 12. 주요 위험과 대응

| 위험                              | 영향                | 대응                                                           |
| --------------------------------- | ------------------- | -------------------------------------------------------------- |
| Wanted 페이지 구조/접근 정책 변경 | 자동 수집 실패      | parser fixture, 명확한 오류, 수동 본문 fallback                |
| n8n 로컬 종료                     | 작업 지연           | 작업을 DB에 먼저 생성, 재시도 가능, 운영 위치는 실사용 후 결정 |
| Worker → 로컬 n8n 접근 불가       | dispatch 실패       | 개발 중 직접 localhost 또는 임시 Tunnel, 운영은 HTTPS endpoint |
| AI hallucination                  | 잘못된 준비 방향    | 근거 필수, unknown 허용, 2단계 분석, 사용자 검토               |
| PDF 개인정보 공개                 | 개인정보 노출       | 커밋·배포 전 수동 검토, 필요 시 비공개 Storage 사용            |
| 중복 클릭/재시도                  | 비용 및 데이터 중복 | Idempotency-Key, event ID unique, 상태 전이 검증               |
| Slack Webhook 유출                | 스팸/정보 노출      | Secret 저장, 로그 redaction, 즉시 rotation                     |
| n8n 실행 DB 증가                  | 디스크 고갈         | pruning, 성공 실행 저장 최소화, volume 모니터링                |
| Free plan 한도 변화               | 운영 중 중단        | 구현 시 공식 한도 재확인, 서비스별 교체 가능 경계 유지         |

## 13. 전체 완료 정의

- [ ] Wanted URL 입력부터 분석 완료까지 수동 DB 수정 없이 동작한다.
- [ ] 자동 수집 실패 시 수동 본문 입력으로 같은 작업을 완료한다.
- [ ] 관리자 외 사용자는 API와 관리자 데이터에 접근할 수 없다.
- [ ] 중복 요청과 callback이 AI 호출 또는 결과를 중복 생성하지 않는다.
- [ ] 결과에 적합도, 근거, 부족 역량, 준비 액션, 예상 질문이 포함된다.
- [ ] 완료·실패·입력 필요 알림이 Slack에 도착한다.
- [ ] 이력서·포트폴리오 버전과 분석 모델/프롬프트/스키마 버전을 추적할 수 있다.
- [ ] 핵심 실패 시나리오와 보안 경계가 자동 테스트 또는 재현 절차로 검증된다.
- [ ] 로컬 실행, secret 등록, migration, workflow import/export, 장애 복구 문서가 있다.
- [ ] 실제 지원 공고 5개 이상을 처리하고 품질·비용·실패 사례를 회고한다.

## 14. 다음 작업

다음 구현은 **3단계 — 공개 이력서·포트폴리오 화면**이다. 기존 PDF의 공개 개인정보 범위를 먼저 검토한 뒤 `/resume`, `/portfolio` 페이지와 PDF 보기·다운로드·모바일 fallback을 구현한다. 관리자 인증과 DB는 이후 단계에서 진행한다.
