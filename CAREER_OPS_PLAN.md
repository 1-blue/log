# 취업 준비 관리·자동화 확장 프로젝트 계획

> 기준일: 2026-09-13
> 작업 브랜치: `codex/career-ops-foundation`  
> 현재 범위: 11단계 코드·DB 구현 완료, 12~15단계 외부 연동 없는 개발 우선 진행

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

| 영역            | 선택                                             | 이유                                                           |
| --------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| 웹 애플리케이션 | 기존 `apps/blog`의 Next.js                       | 공개 블로그와 관리자 화면의 디자인·코드 재사용                 |
| 웹 배포         | 기존 Vercel 유지                                 | 현재 배포 흐름을 보존하고 Cloudflare Pages 중복 도입 방지      |
| API Gateway     | `apps/worker`의 Cloudflare Worker                | 관리자 인증, 검증, 멱등성, Rate Limit, n8n 은닉                |
| 자동화          | `apps/n8n`의 Docker Compose 기반 n8n             | 로컬 무료 개발 후 운영 호스팅은 사용량을 보고 결정             |
| 데이터베이스    | Supabase PostgreSQL + Storage                    | Auth, 데이터, 비공개 문서 버전을 한 서비스에서 시작            |
| 인증            | Supabase Auth, 관리자 1명                        | 브라우저에 비밀번호를 포함하지 않고 확장 가능한 세션 사용      |
| AI              | OpenAI Responses API + `gpt-5.4-mini-2026-03-17` | 비용·속도와 구조화 분석 품질의 균형, 재현 가능한 snapshot 고정 |
| 알림            | Slack Incoming Webhook                           | 비동기 완료·실패를 기다리지 않고 확인                          |
| 최초 공고 소스  | Wanted                                           | MVP 파서와 검증 범위를 한 사이트로 제한                        |
| 공유 계약       | `packages/contracts`                             | Next.js, Worker, n8n 입출력 형식의 불일치 방지                 |

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

진행 순서는 다음 원칙으로 고정한다.

1. 12~15단계에서 실제 외부 API 호출·운영 배포 없이 코드, 계약, migration, fixture, mock, 로컬 UI를 완성한다.
2. 개발 중 타입 검사·단위 테스트·fixture 테스트는 계속 실행하되 실제 Credential과 운영 서비스가 필요한 검증은 보류한다.
3. 16단계에서 OpenAI, Slack, Vercel, Cloudflare, Supabase, 운영 n8n을 한 번에 연결한다.
4. 17단계에서 실제 외부 서비스가 포함된 통합·장애·보안 테스트를 수행한다.
5. 이후 실사용 보완, 블로그 글 작성, 이력서·포트폴리오 반영을 순서대로 진행한다.

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
- `/apps/blog/public/pdfs`의 현재 PDF 2개는 Git에 추적되어 있다. 공개 저장소에 push하기 전에 전화번호, 주소, 이메일 등 개인정보 공개 범위를 반드시 확인하며, 버전 관리 원본은 이후 비공개 Supabase Storage로 이전한다.

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

### 3단계 — Supabase 문서 저장 기반

목표: 이력서·포트폴리오를 Git의 고정 파일이 아닌 비공개 Storage의 불변 버전으로 관리할 기반을 만든다.

- [x] 현재 Supabase 프로젝트의 project ref, region, active status와 기존 migration 상태 확인
- [x] `document_versions`, `document_publications`와 문서 유형·추출 상태 enum을 migration으로 구현
- [x] `career-documents` 비공개 bucket을 migration으로 생성
- [x] bucket은 PDF만 허용하고 파일당 최대 크기를 20MB로 제한
- [x] 저장 경로를 `{owner_id}/{document_type}/{version_id}.pdf`로 고정하고 덮어쓰기 차단
- [x] 문서 테이블과 Storage object에 소유자 기반 RLS 정책 구성
- [x] 익명 테이블·Storage 접근을 차단하고 향후 Worker signed URL 방식으로 공개하도록 결정
- [x] 원격 migration dry-run, 적용, migration 이력, schema lint, DB 타입 생성 완료
- [x] 임시 사용자 기반 원격 통합 검증으로 DB·Storage 소유권과 익명 다운로드 차단 확인
- [x] 검증 결과와 원격 migration 운영 규칙 문서화

이번 단계에서는 지원 공고·분석·면접 테이블, 인증 UI, PDF 업로드 UI를 만들지 않는다. 실제 PDF는 5단계에서 업로드하고 공개 페이지는 6단계에서 Worker signed URL과 연결한다.

종료 기준: 원격 Supabase에 문서 버전과 비공개 bucket이 migration으로 구성되고, 소유자 외의 익명·인증 사용자가 문서 데이터와 파일에 접근할 수 없다.

검증 결과:

- 대상 프로젝트 `blog`에 migration 2개가 적용되고 local/remote 이력이 일치한다.
- `public`, `private`, `storage` schema lint에서 신규 schema 오류가 없다. Supabase 기본 Storage 함수의 기존 warning 2건은 남아 있다.
- 임시 Auth 사용자 2명으로 소유자 CRUD, 교차 소유자 차단, PDF 업로드·다운로드, 익명 다운로드 차단을 확인한 뒤 테스트 사용자와 파일을 삭제했다.
- 문서 metadata 수정, 공개 지정, 공개 중 archive 차단, 공개 해제 후 archive 허용 lifecycle을 확인한 뒤 테스트 데이터를 삭제했다.
- 원격 schema에서 `packages/contracts/src/database.types.ts`를 생성했으며 contracts, 전체 타입, lint, test, build가 통과했다.

### 4단계 — 관리자 인증과 관리자 셸

목표: 브라우저 코드에 비밀번호를 넣지 않고 `/admin` 전체를 보호한다.

- [x] Supabase SSR 인증 클라이언트 구성
- [x] 로그인, 로그아웃, 세션 갱신 구현
- [x] `/admin` 레이아웃과 기존 블로그 디자인 토큰 재사용
- [x] 미인증 사용자의 관리자 Route 접근 차단
- [x] 로그인 사용자의 UUID가 `ADMIN_USER_ID`와 일치하는지 서버/Worker 양쪽에서 확인
- [x] 로그인 오류, 만료, 네트워크 장애 UI 구현
- [x] 관리자 페이지와 민감 응답에 `noindex`, 적절한 cache-control 적용

종료 기준: 허용된 한 계정만 관리자 화면과 Worker API를 사용할 수 있다.

검증 결과:

- Next.js는 `@supabase/ssr` 기반 브라우저·서버·middleware 클라이언트를 분리하고 `getClaims()`로 관리자 UUID를 재검증한다.
- `/admin` middleware와 보호 레이아웃을 함께 적용하고 로그인·로그아웃 Server Action, 안전한 `next` 경로, 세션 갱신 흐름을 구현했다.
- 관리자 페이지는 `noindex`, `nofollow`, `nocache`와 `private, no-store` 응답 정책을 적용했다.
- Worker의 공개 `/health`는 유지하고 `/v1/auth/me`에는 Supabase JWKS 서명·issuer·audience·role·subject 검증을 적용했다.
- 실제 관리자 비밀번호나 토큰을 fixture에 저장하지 않고 임시 ES256 키로 인증 성공·실패·JWKS 장애를 자동 검증한다.
- contracts 7개, Next.js 인증 16개, Worker 17개 테스트와 전체 타입 검사·lint·production build가 통과했다.
- 로컬 HTTP에서 `/health` 200, 미인증 `/v1/auth/me` 401, 보호 API preflight 204, 미인증 `/admin` 로그인 redirect와 보안 헤더를 확인했다.
- 실제 브라우저에서 로그인 폼의 접근성 구조와 다크모드 렌더링을 확인하고 기존 `next-themes` hydration 경고를 제거했다.
- Turnstile·MFA는 현재 1인용 MVP의 필수 조건이 아니다. 운영 연동 후 위험을 다시 평가해 필요할 때만 적용하고, 비밀번호 복구는 Supabase Dashboard에서만 수행한다.

### 5단계 — 이력서·포트폴리오 업로드 및 버전 관리

목표: 문서를 Git의 고정 파일이 아니라 외부에서 등록하는 변경 불가능한 버전으로 관리한다.

- [ ] 현재 PDF의 개인정보와 공개 범위를 검토하고 최초 버전으로 이전할 파일 확정
- [x] `/admin/documents`에서 이력서·포트폴리오 PDF 등록, 목록, 상세, archive 기능 구현
- [x] 6MB를 넘는 PDF는 Supabase resumable upload를 사용하고 Storage로 직접 업로드
- [x] 업로드마다 UUID 기반 새 경로를 사용하고 `upsert` 또는 기존 파일 덮어쓰기 금지
- [x] 문서 유형, 버전명, 원본 파일명, 크기, MIME type, SHA-256 hash, 생성일 저장
- [x] 기본 선택 버전과 공개 버전을 별도로 지정하고 유형별 하나만 유지
- [x] 지원·분석에 참조된 버전은 hard delete하지 않고 archive 처리
- [x] PDF 텍스트 추출 상태와 사람이 수정할 분석용 텍스트 필드를 준비
- [x] 새 버전 등록 후 기존 지원·분석의 참조가 자동 변경되지 않게 보장

종료 기준: 관리자 화면에서 새 문서를 등록하고 기본·공개 버전을 선택할 수 있으며, 이전 버전과 참조 관계가 보존된다.

구현 및 검증 결과:

- Worker가 JWT 관리자 확인 후 업로드 준비·완료, 목록·상세, metadata 수정, 기본·공개·보관 상태 변경, 60초 signed download URL을 제공한다.
- 업로드 완료 시 Storage object의 크기, MIME type, PDF signature, SHA-256을 Worker가 다시 검증하고 실패한 object는 제거한다.
- 6MiB 이하 파일은 signed upload URL, 초과 파일은 6MiB chunk의 TUS resumable upload를 사용하며 최대 크기는 20MiB다.
- 첫 활성 버전만 자동으로 기본 지정하고 이후 버전과 공개 버전 변경은 명시적으로 수행하도록 DB 함수를 추가했다.
- 원격 `blog` Supabase에 migration을 dry-run 후 적용했고 schema lint와 DB 타입 재생성을 완료했다.
- contracts 9개, Next.js 인증 16개, Worker 24개 테스트와 전체 타입 검사·lint·production build가 통과했다.
- Docker가 실행 중이 아니어서 신규 pgTAP 테스트는 로컬에서 실행하지 못했다. 실제 관리자 로그인과 현재 PDF 2개의 업로드·공개 범위 확인, 큰 PDF 완료 검증의 Cloudflare Free CPU 사용량 확인도 사용자 확인 단계로 남겨 둔다.
- 기존 `apps/blog/public/pdfs` 파일은 실제 공개 화면 전환을 확인할 때까지 유지하되 새 공개 페이지에서는 참조하거나 fallback으로 사용하지 않는다.

### 6단계 — 공개 이력서·포트폴리오 화면

목표: 기존 블로그 디자인을 유지하면서 관리자가 지정한 현재 공개 버전만 제공한다.

- [x] `/resume`, `/portfolio` 페이지를 `document_publications`의 현재 버전에 연결
- [x] 공개 지정된 Storage object에만 Worker의 짧은 signed URL로 접근 허용
- [x] PDF 보기, 새 탭 열기, 다운로드, 모바일 fallback 제공
- [x] 공개 버전이 없거나 일시적으로 접근할 수 없을 때 안내 상태 제공
- [x] 메타데이터, sitemap, 내비게이션, 접근성 확인
- [x] 외부 검색 노출 여부와 PDF 캐시 정책 결정

종료 기준: 데스크톱·모바일에서 현재 공개 버전만 볼 수 있고, 비공개 및 이전 문서가 의도치 않게 노출되지 않는다.

구현 및 검증 결과:

- 인증 없는 `GET /v1/public/document-publications/:type`은 관리자 1명의 현재 공개 포인터만 조회하고 60초 signed URL을 반환한다.
- 공개 응답은 문서 종류, URL, 만료 시각만 포함하며 문서 버전 ID, 파일명, Storage 경로, hash 등 내부 metadata를 노출하지 않는다.
- 공개 해제 상태는 404 빈 상태, Storage 장애는 재시도 가능한 503으로 구분하고 모든 응답은 `no-store`로 제공한다.
- `/resume`, `/portfolio`는 정적 페이지 셸로 생성하고 실제 문서 URL은 브라우저에서 필요할 때만 발급한다. 새 탭과 다운로드도 클릭 시 새 URL을 사용한다.
- 모바일에서는 숨겨진 iframe으로 큰 PDF를 내려받지 않고 새 탭·다운로드 동작을 안내한다.
- 두 페이지는 내비게이션에 추가하되 sitemap에서 제외하고 `noindex`, `nofollow`, `noarchive`, `nocache`를 적용했다.
- 기존 `public/pdfs`는 삭제하지 않았으며 `X-Robots-Tag: noindex, nofollow, noarchive`를 적용했다. 새 페이지에는 기존 파일 fallback이 없다.
- 신규 환경변수, 패키지, DB migration 없이 기존 공개 포인터와 Worker 설정을 재사용했다.
- contracts 9개, Worker 30개, Next.js 22개 테스트가 통과했고 `/resume`, `/portfolio`가 정적 페이지로 production build되는 것을 확인했다.
- 로컬 production 응답에서 `noindex` robots metadata, sitemap 제외, 초기 HTML의 Supabase·기존 PDF 경로 미포함, `/pdfs/*`의 `X-Robots-Tag`를 확인했다.
- 실제 관리자 계정으로 문서를 공개한 뒤 데스크톱·모바일 표시, 새 탭, 다운로드, 공개 해제를 확인하는 수동 통합 검증은 남아 있다.

### 7단계 — 지원 공고 및 지원 상태 CRUD

목표: AI 없이도 기본 지원 관리 도구로 사용할 수 있게 한다.

- [x] 회사, 공고 URL, 제목, 지원 상태, 지원일, 면접일 입력 폼
- [x] 지원할 이력서·포트폴리오 버전을 명시적으로 선택
- [x] 목록 검색·필터·정렬 및 상세 화면
- [x] 상태 변경 이력 저장
- [x] 메모 저장 및 수정 시간 표시
- [x] URL 중복 경고와 동일 공고 재지원 정책 구현
- [x] 삭제는 기본적으로 soft delete 또는 archive 처리

종료 기준: 공고 등록부터 문서 버전 선택, 상태 변경과 회고 기록까지 수동으로 안정적으로 사용할 수 있다.

구현 및 검증 결과:

- Wanted 공고는 소유자·출처·공고 ID 조합으로 한 번만 저장하며 URL과 외부 ID는 생성 후 변경할 수 없다. 회사명과 공고명은 정정할 수 있다.
- 같은 공고에 다시 지원할 때 공고를 복제하지 않고 `attempt_number`가 증가하는 새 지원 이력을 만든다. 중복 등록 응답에는 기존 상세 화면으로 이동할 수 있는 ID를 포함한다.
- `interested`와 `preparing`에서는 문서 선택이 선택 사항이고, `applied` 이후 제출 상태에서는 이력서와 포트폴리오가 모두 필요하다.
- 제출 상태가 된 시점의 문서 선택은 영구 잠기며 이후 문서를 바꾸려면 재지원 이력을 새로 만들어야 한다. 보관은 지원 상태와 별도 시각으로 관리한다.
- 관리자 화면에 지원 목록 검색·상태/보관 필터·정렬·페이지 이동, 신규 등록, 상세 수정, 재지원, 보관/복원, 상태 이력을 구현했다.
- Worker에 인증된 지원 CRUD API 6개를 추가하고 입력 크기·JSON Content-Type·Wanted URL·UUID·enum·날짜를 공통 Zod 계약으로 검증한다.
- 원격 Supabase에 migration 3개를 적용하고 schema lint와 DB 타입 생성을 완료했다. 롤백형 원격 통합 검증으로 최초 제출 상태 등록, 문서 필수·잠금, 재지원 차수, 상태 이력과 보관 분리를 확인해 테스트 데이터는 남지 않는다.
- contracts 13개, Next.js 25개, Worker 39개 테스트와 전체 타입 검사·lint·production build가 통과했다. lint에는 기존 블로그 import 정렬 warning만 남아 있다.
- Docker가 실행 중이 아니고 원격 DB에는 pgTAP 확장이 없어 pgTAP 파일은 실행하지 못했다. 동일 핵심 규칙은 pgTAP 비의존 원격 통합 SQL로 검증했다.
- 실제 관리자 계정으로 공고 등록부터 수정·재지원·보관까지 확인하는 수동 통합 검증은 남아 있다. 신규 환경변수는 없다.

### 8단계 — Cloudflare Worker API Gateway

목표: n8n Webhook을 숨기고 외부 요청의 보안·정합성을 한곳에서 처리한다.

- [x] `APP_BASE_URL` 기준 Origin 검증과 CORS preflight 기반 구현
- [x] Supabase JWT를 JWKS로 검증하고 관리자 UUID 확인
- [x] 요청 body 크기, Content-Type, URL, UUID, enum, 날짜 검증
- [x] `X-Request-Id` 생성·응답 및 기본 구조화 로그 구현
- [x] `Idempotency-Key` 저장과 같은 요청의 중복 실행 방지
- [x] Cloudflare Rate Limiting binding 기반 제한 구현
- [x] n8n 요청에 timestamp, request ID, HMAC 서명 추가
- [x] upstream timeout 처리와 오류 코드 세분화
- [x] 공개 API와 `/v1/internal/*` 콜백 API 분리

종료 기준: 인증되지 않은 요청, 재전송 공격, 중복 요청, 잘못된 입력이 차단되고 정상 요청은 추적 가능하다.

- 중복 생성 위험이 있는 지원 등록·재지원·문서 업로드 준비·완료 POST에 UUID `Idempotency-Key`를 요구한다. Supabase의 원자적 claim/complete/release RPC와 `(owner_id, idempotency_key)` unique 제약으로 처리 중 요청, 다른 내용의 키 재사용, 완료 응답 재전송을 구분한다.
- 완료 응답은 24시간 보존하고 동일 요청에는 원래 응답과 `Idempotency-Replayed: true`를 반환한다. 실패한 실행은 claim을 해제하며 실행 UUID가 일치하는 요청만 완료·해제할 수 있다.
- Cloudflare Rate Limiting binding은 공개 문서 API를 IP·경로별 분당 60회, 인증된 관리자 API를 관리자 UUID별 분당 120회로 제한한다. `/health`는 제한하지 않으며 binding 장애 시 우회하지 않고 retry 가능한 503을 반환한다.
- Worker와 n8n 사이에는 HMAC-SHA256으로 timestamp, event ID, request ID, method, path, body hash를 서명한다. 내부 API는 POST·JSON·600KB 이하·±5분 서명만 허용한다.
- n8n dispatch client는 5초 안의 2xx만 접수 성공으로 처리하며 timeout, 네트워크·429·5xx, 그 외 4xx를 구분한다. 11단계에서 분석 dispatch route, HMAC callback, 결과 원자적 저장을 연결했으며 고급 재시도·취소·stale 감지는 12단계에서 보완한다.
- 원격 Supabase에 멱등성 migration을 적용하고 schema lint와 rollback 통합 SQL을 통과했다. contracts 14개, Next.js 27개, Worker 56개 테스트와 타입 검사가 통과했으며 신규 환경변수는 없다.

### 9단계 — 로컬 n8n Docker 환경

목표: 클라우드 비용 없이 재현 가능한 자동화 개발 환경을 만든다.

- [x] n8n과 전용 PostgreSQL의 Docker Compose 작성
- [x] 이미지 버전, 포트, 시간대, DB 이름과 실행 기록 정책을 Compose에 고정하고 healthcheck 추가
- [x] volume, 네트워크, 재시작 정책 구성
- [x] `.env`에는 암호화 키, DB 비밀번호, 공유 Secret, 환경별 URL·ID만 보관
- [x] OpenAI API Key와 Slack Bot Token은 16단계 외부 연동 시 n8n Credentials에 암호화하도록 경계 확정
- [x] n8n 암호화 키와 PostgreSQL 비밀번호, 양방향 HMAC Secret 로컬 교체
- [x] n8n owner 계정 로컬 설정
- [x] 샘플 workflow JSON과 import/export 절차를 Git으로 버전 관리
- [x] n8n UI와 Webhook을 인터넷에 직접 공개하지 않는 기본 구성
- [x] 실제 외부 Webhook 시험이 필요할 때만 임시 Cloudflare Tunnel 사용

종료 기준: `docker compose up`으로 재시작 가능한 로컬 n8n과 영속 DB가 실행되고 샘플 Webhook이 동작한다.

- 공식 레지스트리에서 Apple Silicon을 포함한 multi-platform manifest를 확인하고 n8n 2.38.7과 PostgreSQL 18.6 Alpine을 태그와 digest로 고정했다. PostgreSQL 비공개 네트워크·localhost 전용 n8n 포트·readiness healthcheck·named volume·재시작 정책을 구성했다.
- 성공 production 실행은 저장하지 않고 오류·수동 실행만 보존하며, 7일 또는 1,000건 기준으로 pruning하고 동시 실행을 2개로 제한한다.
- `/webhook/career-analysis`에서 `202 Accepted`를 반환하는 Credential 없는 smoke Workflow와 owner 설정, import/export, 백업·복구 절차를 문서화했다.
- 앞선 출력에 노출된 암호화 키·DB 비밀번호·양방향 HMAC Secret은 실제 값을 출력하지 않고 교체했으며 n8n과 Worker의 HMAC 쌍이 일치함을 확인했다. Slack 에러 Webhook은 사용자 판단에 따라 기존 URL을 계속 사용하며, 양쪽 로컬 환경파일의 값 일치와 재생성된 n8n 컨테이너의 주입 상태를 확인했다.
- Docker Desktop credential store 경로에서 공개 이미지 pull이 멈추는 현상은 임시 빈 Docker 설정으로 우회했으며 기존 Docker 로그인 설정과 다른 Supabase 컨테이너는 변경하지 않았다.
- n8n과 PostgreSQL이 전용 network와 named volume에서 healthy 상태로 실행 중이며 n8n 2.38.7, 전용 DB 연결, readiness, localhost 포트 제한과 PostgreSQL 호스트 포트 미노출을 확인했다.
- owner 계정을 생성하고 샘플 Workflow를 import·publish한 뒤 `/webhook/career-analysis`의 `202 Accepted`와 요청 ID 보존을 확인했다.
- n8n 재시작, PostgreSQL 재시작, volume을 보존한 Compose 전체 재생성 후에도 owner와 활성 Workflow가 유지되고 Webhook이 정상 응답했다.
- PostgreSQL custom-format 백업을 생성하고 `pg_restore --list`로 카탈로그를 비파괴 검증했다. 실제 복원 훈련과 백업 자동화는 운영 배포 단계에서 수행한다.

### 10단계 — Wanted 공고 수집과 수동 fallback

목표: Wanted URL에서 분석 가능한 본문을 얻되 수집 실패가 전체 기능을 막지 않게 한다.

- [x] `https://www.wanted.co.kr/wd/{숫자}` 형식만 허용하고 canonical URL 생성
- [x] redirect, timeout, 응답 크기, Content-Type 제한
- [x] localhost, 사설 IP, link-local 등 SSRF 대상 차단
- [x] 공식적으로 노출된 HTML/구조화 데이터에서 제목, 회사, 본문 추출
- [x] 공고 ID와 수집 시각, 원문 hash, parser version 저장
- [x] 본문 정규화 시 섹션과 원문 근거 위치 보존
- [x] 로그인, 차단, 만료, 구조 변경을 구분한 오류 코드 정의
- [x] 실패 시 사용자가 공고 본문을 직접 붙여 넣어 재개하는 UI 구현
- [x] 접근 제한 우회·CAPTCHA 해결·과도한 반복 요청은 구현하지 않음

종료 기준: 지원되는 Wanted 공고는 자동 수집되고, 실패한 공고도 수동 원문으로 동일 분석 흐름을 완료한다.

- 공고 등록 직후 자동 수집을 접수하며 실패해도 지원 정보는 유지한다. 상세 화면에서 진행 상태를 polling하고 자동 재시도 또는 100~100,000자의 수동 원문 저장을 실행할 수 있다.
- `job_posting_collection_runs`와 불변 `job_posting_snapshots`를 추가했다. 공고별 활성 실행은 하나로 제한하고 동일 SHA-256 콘텐츠는 기존 스냅샷을 재사용한다.
- Worker는 모든 JSON-LD script의 객체·배열·`@graph`에서 `JobPosting`을 찾고 URL·제목·회사·본문을 검증한다. 입력한 회사명·공고명은 덮어쓰지 않고 추출값과 차이만 관리자 화면에 표시한다.
- n8n은 양방향 HMAC 검증, 즉시 202 응답, 리다이렉트 금지, 10초 timeout, 600KB 제한과 SSRF 보호를 적용한다. 비공개 API, 브라우저 위장, CAPTCHA 우회와 자동 반복 재시도는 사용하지 않는다.
- 원격 migration과 schema lint, 생성 DB 타입, rollback 통합 SQL을 검증했다. 로컬 Supabase는 다른 프로젝트가 54322 포트를 사용해 시작하지 못했지만 동일 DB 규칙은 원격 rollback 테스트로 검증했다.
- n8n의 잘못된 서명 401, 올바른 서명 202, 실제 Wanted 200 HTML 수집과 Worker callback HMAC 통과를 확인했다. 테스트 callback은 의도적으로 존재하지 않는 실행 ID를 사용해 저장 직전 404에서 종료했다.
- 실제 관리자 로그인으로 공고 등록부터 수동 fallback까지 확인하는 브라우저 수동 검증은 환경이 가능할 때 수행한다. 신규 비밀 환경변수는 없다.

### 11단계 — OpenAI 구조화 분석 Workflow

목표: 공고와 개인 자료를 근거 기반의 안정적인 JSON 결과로 변환한다.

- [x] 1차 호출에서 공고의 사실 정보만 추출
- [x] 2차 호출에서 개인 자료와 비교하고 적합도·격차·질문 생성
- [x] Responses API Structured Outputs와 공통 JSON Schema 사용
- [ ] OpenAI API Key는 환경변수가 아니라 n8n Credentials로 연결
- [x] 모든 주장에 공고 또는 개인 자료의 근거 snippet/section 연결
- [x] `unknown`과 추론을 명시하고 없는 경험을 생성하지 않도록 프롬프트 설계
- [x] model, prompt version, schema version, token 사용량, latency 저장
- [x] 입력 길이 제한, 문서 trimming, timeout, 최대 2회 시도, 출력 token 상한 구현
- [ ] 응답 스키마 불일치 시 제한된 횟수로 자동 복구
- [x] Wanted 공고·이력서·포트폴리오 대표 fixture와 기대 필드 검사 작성

종료 기준: 같은 입력의 결과가 스키마를 항상 만족하며 UI가 임의 텍스트 파싱 없이 렌더링한다.

- 지원서별 최신 공고 스냅샷과 선택 문서 버전을 `analysis_jobs`에 복사해 이후 원문이 바뀌어도 분석 입력을 재현할 수 있다.
- 이력서·포트폴리오는 `ready` 상태의 수동 추출 텍스트만 사용한다. 각 문서는 최대 80,000자로 제한하고 초과 시 앞 40,000자·중간 20,000자·끝 20,000자를 결정론적으로 보존한다.
- `JobPostingFactsSchema`와 `ProfileComparisonSchema`를 분리하고 OpenAI용 JSON Schema를 Zod 원본에서 생성한다. 모든 객체는 required와 `additionalProperties: false`를 재귀 검증한다.
- Worker가 요구사항 ID, 출처 버전 ID, 실제 원문에 존재하는 excerpt, 참조 무결성, matched/partial의 개인 근거를 검증한다. 적합도는 필수 70%·우대 30% 규칙으로 Worker와 n8n에서 동일하게 계산한다.
- `analysis_jobs`, 불변 `analysis_results`, `analysis_step_executions`, 원자적 완료·상태 이벤트 RPC와 소유자 RLS를 원격 Supabase에 적용했다. 원격 rollback 통합 테스트와 schema lint를 통과했다.
- 관리자 상세 화면에서 분석 준비 조건, 수동 시작, 2초 polling, 최소 점수·요약·건수·구조화 JSON·최근 이력을 확인할 수 있다. 상세 결과 UX는 13단계에서 구현한다.
- n8n 소스 Workflow는 기존 수집 분기를 유지하며 두 OpenAI V2.2 노드, `store: false`, 고정 model snapshot, prompt version과 HMAC callback을 포함한다. 현재 실행 중인 Workflow는 OpenAI Credential이 없어 교체·게시하지 않았다.
- OpenAI Credential 연결과 실제 API 호출은 외부 연동 일괄 작업까지 보류한다. 그전에는 fixture와 mock으로 계약·상태 전이·재시도 동작을 자동 검증하며 12단계 이후 구현을 계속할 수 있다.
- 외부 연동 시 n8n에 `OpenAI Career Analysis` Credential 생성, 두 OpenAI 노드 연결, 소스 Workflow import·게시, 실제 공고 1건 분석과 비용·오류 확인을 순서대로 수행한다.

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

### 14단계 — Slack 알림 기능 개발

목표: 실제 Slack을 호출하지 않고도 알림 생성·라우팅·중복 방지 로직을 완성한다.

- [ ] Slack 발송 adapter와 mock transport를 분리
- [ ] 공고마다 루트 메시지를 한 번만 생성하는 상태 모델 구현
- [ ] 공고 등록, 분석 완료, 지원 상태, 면접 관련 알림은 해당 공고의 스레드에 기록
- [ ] Bot API 응답의 channel ID와 message `ts`를 공고 데이터에 저장해 스레드 재사용
- [ ] 알림 본문에 환경, 회사/공고, 작업 ID, 상태, 경과 시간, 관리자 링크 포함
- [ ] 성공 메시지는 요약과 핵심 부족 역량만 포함하고 전체 개인정보는 제외
- [ ] 실패 메시지는 오류 코드, 실패 단계, 재시도 여부 포함
- [ ] Slack 실패가 본 작업을 실패시키지 않도록 분리
- [ ] 같은 event ID의 중복 알림 방지
- [ ] Bot API와 Incoming Webhook의 성공·429·5xx·잘못된 인증 응답 fixture 테스트
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

종료 기준: 실제 Token이나 Webhook 없이도 완료·실패·사용자 조치 필요 이벤트의 payload, 라우팅, 중복 방지와 실패 격리가 자동 검증된다.

### 15단계 — 외부 연동 전 개발 완결성 확보

목표: 외부 Credential을 등록하기 전에 구현·설정·복구 절차를 배포 가능한 상태로 완성한다.

- [ ] 계약 스키마와 상태 전이 단위 테스트
- [ ] Worker 인증, CORS, SSRF, HMAC, 멱등성, Rate Limit 테스트
- [ ] Wanted fixture 기반 parser 회귀 테스트
- [ ] n8n 성공·수집 실패·AI 429·callback 실패 fixture Workflow 테스트
- [ ] 민감값 redaction과 로그 구조 검증
- [ ] DB migration, RLS, index와 주요 query 계획 검증
- [ ] Vercel·Worker·n8n의 환경별 설정 template과 배포 전 체크리스트 작성
- [ ] n8n Workflow export와 Supabase backup·복구 절차 작성
- [ ] 의존성 및 컨테이너 이미지 보안 업데이트 절차 작성
- [ ] 장애 대응 runbook과 수동 복구 절차 작성
- [ ] 전체 타입 검사, lint, test, production build와 정적 보안 검사를 한 번에 실행하는 검증 명령 구성

종료 기준: 외부 서비스 접속 없이 자동 검증이 통과하고, 이후 단계에서는 코드 개발보다 Credential 등록과 실제 연동 확인에 집중할 수 있다.

### 16단계 — 외부 요소 연결 및 운영 배포

목표: 개발이 끝난 코드를 실제 외부 서비스와 연결하고 운영 환경에 배포한다.

- [ ] 외부 연동에 필요한 계정, Credential, URL, Secret 최종 목록 확인
- [ ] n8n에 `OpenAI Career Analysis` Credential 생성 후 두 OpenAI 노드에 연결
- [ ] 최신 n8n Workflow를 백업 후 import·게시
- [ ] Slack에 `#채용공고`, `#시스템-에러` 채널과 최소 권한 Bot·Incoming Webhook 연결
- [ ] Vercel에 Next.js 환경변수와 관리자 redirect URL 설정
- [ ] Cloudflare Worker 개발/운영 환경 분리 및 secret 등록
- [ ] n8n 운영 위치는 로컬 사용량·안정성 측정 후 결정
- [ ] 운영 n8n 선택 시 Docker, HTTPS, 방화벽, backup, update 정책 적용
- [ ] Supabase 운영 환경, Auth redirect URL, Storage와 migration 상태 최종 확인
- [ ] 환경별 Origin, callback URL, Webhook URL과 Secret 조합 검증
- [ ] 배포 전 Secret rotation과 최소 권한 확인

종료 기준: 모든 운영 서비스가 연결되고 실제 테스트를 시작할 수 있는 배포 상태가 된다.

### 17단계 — 외부 연동 통합 테스트

목표: 운영과 동일한 연결을 사용해 전체 흐름과 장애 복구를 검증한다.

- [ ] 관리자 로그인부터 문서 등록, 공고 수집, AI 분석, 결과 조회까지 E2E 확인
- [ ] 실제 Wanted 공고 1건으로 OpenAI 구조화 결과와 근거 무결성 검증
- [ ] Slack 루트 메시지·스레드·에러 채널 알림 수신 확인
- [ ] OpenAI 429·5xx, n8n 중단, callback 실패와 재시도·취소·stale 복구 확인
- [ ] Vercel ↔ Worker ↔ n8n ↔ Supabase의 CORS, 인증, HMAC, Rate Limit 확인
- [ ] 로그의 Request ID 추적과 민감값 redaction 확인
- [ ] DB backup 복구와 n8n Workflow rollback을 실제 절차로 검증
- [ ] 처리 시간, token 사용량, API 비용과 실패율 기준선 기록

종료 기준: 실제 외부 서비스가 포함된 정상·실패 흐름이 모두 재현되고 치명적인 운영 문제가 없다.

### 18단계 — 실제 사용 및 보완

목표: 실제 취업 준비 과정에서 사용하며 기술 검증만으로 찾기 어려운 문제를 개선한다.

- [ ] 실제 지원 공고 5개 이상 등록·분석
- [ ] 공고별 이력서·포트폴리오 선택과 분석 결과 활용성 확인
- [ ] 면접 질문 답변과 면접 회고를 실제로 작성
- [ ] 분석 품질, 처리 시간, 비용, 실패율과 수동 개입 횟수 기록
- [ ] 불편 사항과 반복 오류를 우선순위 backlog로 정리
- [ ] 필요한 코드·Workflow·프롬프트를 보완하고 회귀 테스트
- [ ] MVP 완료 범위와 후속 기능을 확정

종료 기준: 실제 사용 데이터로 핵심 기능의 효용과 안정성을 확인하고 주요 불편을 보완한다.

### 19단계 — 기술 블로그 글 작성

목표: 구현 나열이 아니라 문제, 판단, 실패와 운영 경험을 재현 가능한 사례로 정리한다.

- [ ] 개인정보와 회사 지원 정보를 제거한 아키텍처 다이어그램 작성
- [ ] Next.js, Worker, n8n, Supabase의 역할 분리와 선택 이유 설명
- [ ] 인증, HMAC, 멱등성, 재시도, 상태 머신과 근거 기반 AI 분석 사례 정리
- [ ] 실제 장애와 개선 과정 및 비용·처리 시간 지표 포함
- [ ] 로컬 실행과 검증 가능한 범위를 README와 연결
- [ ] 기존 블로그 형식에 맞춰 게시하고 모바일·다크모드·링크 검수

종료 기준: 프로젝트의 문제 해결 과정과 기술적 판단을 면접에서 설명할 수 있는 공개 글이 완성된다.

### 20단계 — 이력서 및 포트폴리오 반영

목표: 프로젝트 경험을 채용 담당자가 짧은 시간 안에 이해할 수 있는 성과 중심 자료로 변환한다.

- [ ] 프로젝트 한 줄 소개, 담당 범위와 아키텍처 요약 작성
- [ ] 기능 나열 대신 자동화 시간, 처리 건수, 실패율, 비용 등 측정 결과 반영
- [ ] API Gateway, n8n Workflow, Docker 운영, 보안·재시도 경험을 구체적인 bullet로 작성
- [ ] 지원 공고 역량과 프로젝트 근거를 연결하되 과장하지 않음
- [ ] 개인정보를 제거한 화면, 흐름도, 기술 블로그 링크를 포트폴리오에 추가
- [ ] 새 이력서·포트폴리오 PDF를 문서 버전 관리 기능에 등록하고 공개 버전 선택

종료 기준: 실사용과 검증 근거가 포함된 최신 이력서·포트폴리오가 공개된다.

## 6. 데이터 모델 초안

모든 주요 테이블은 `id uuid`, `created_at timestamptz`, `updated_at timestamptz`를 기본으로 사용한다. 사용자 소유 데이터에는 `owner_id uuid`를 두고 단일 관리자 UUID로 RLS를 적용한다.

### 핵심 엔터티

3단계에서는 아래 표의 `document_versions`와 `document_publications`만 생성한다. 나머지 엔터티는 각 기능 단계에서 후속 migration으로 추가한다.

| 테이블                        | 핵심 필드                                                                                                                                                                   | 비고                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `companies`                   | `name`, `website_url`, `notes`                                                                                                                                              | 같은 회사의 여러 공고 연결     |
| `job_postings`                | `company_id`, `source`, `external_id`, `canonical_url`, `title`, `status`, `slack_channel_id`, `slack_thread_ts`                                                            | `(source, external_id)` unique |
| `job_posting_snapshots`       | `job_posting_id`, `raw_content`, `normalized_content`, `content_hash`, `parser_version`, `fetched_at`                                                                       | 공고 변경과 분석 재현성        |
| `job_posting_collection_runs` | `job_posting_id`, `mode`, `status`, `request_id`, `error_code`, `snapshot_id`, `started_at`, `finished_at`                                                                  | 수집 실행 상태와 오류 추적     |
| `applications`                | `job_posting_id`, `status`, `applied_at`, `interview_at`, `archived_at`                                                                                                     | 현재 지원 상태                 |
| `application_status_history`  | `application_id`, `from_status`, `to_status`, `changed_at`, `note`                                                                                                          | 상태 변경 감사 이력            |
| `document_versions`           | `document_type`, `label`, `storage_path`, `original_filename`, `mime_type`, `file_size`, `content_hash`, `extracted_text`, `extraction_status`, `is_default`, `archived_at` | 이력서·포트폴리오 버전 통합    |
| `document_publications`       | `document_type`, `document_version_id`, `published_at`                                                                                                                      | 유형별 현재 공개 버전 1개      |
| `application_documents`       | `application_id`, `resume_version_id`, `portfolio_version_id`, `selected_at`                                                                                                | 공고별 제출 자료 고정          |
| `api_idempotency_records`     | `owner_id`, `idempotency_key`, `request_fingerprint`, `execution_id`, `status`, `response_status`, `response_body`, `expires_at`                                            | 외부 변경 요청 중복 실행 방지  |
| `analysis_jobs`               | `job_posting_id`, `resume_version_id`, `portfolio_version_id`, `status`, `stage`, `request_id`, `idempotency_key`, `attempt_count`, `last_error_code`                       | 비동기 작업 기준 상태          |
| `analysis_job_events`         | `analysis_job_id`, `event_id`, `event_type`, `payload`, `occurred_at`                                                                                                       | callback 멱등성·타임라인       |
| `analysis_results`            | `analysis_job_id`, `schema_version`, `prompt_version`, `model`, `result jsonb`, `usage jsonb`                                                                               | 원본 구조화 결과 보존          |
| `interview_questions`         | `analysis_result_id`, `category`, `question`, `intent`, `evidence`, `priority`                                                                                              | 생성 질문                      |
| `interview_answers`           | `question_id`, `answer`, `revision`, `is_current`                                                                                                                           | 답변 수정 이력                 |
| `interview_notes`             | `application_id`, `interviewed_at`, `round`, `content`, `lessons`                                                                                                           | 면접 회고                      |
| `audit_events`                | `actor_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`                                                                                                  | 민감값 제외 운영 추적          |

### 상태 enum

- 지원 상태: `interested`, `preparing`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`, `archived`
- 작업 상태: `queued`, `running`, `needs_input`, `retrying`, `succeeded`, `failed`, `cancelled`
- 작업 단계: `dispatching`, `fetching`, `normalizing`, `extracting`, `matching`, `generating_questions`, `saving`, `notifying`

### 주요 제약과 인덱스

- `job_postings(source, external_id)` unique
- `api_idempotency_records(owner_id, idempotency_key)` composite primary key
- `analysis_jobs(owner_id, idempotency_key)` partial unique
- `analysis_job_events(event_id)` unique
- `analysis_jobs(status, updated_at)` index
- `applications(status, interview_at)` index
- `document_publications(owner_id, document_type)` composite primary key로 소유자·유형별 공개 버전 하나만 허용
- `document_versions(owner_id, document_type)`에서 `is_default = true`인 행은 partial unique로 유형별 하나만 허용
- `document_versions.storage_path`와 `content_hash`에 index를 두고 같은 hash 업로드 시 중복 경고
- 지원 또는 분석이 참조하는 문서 버전은 hard delete하지 않고 archive 처리
- `resume_version_id`와 `portfolio_version_id`가 각각 올바른 `document_type`인지 저장 함수 또는 trigger에서 검증
- 결과 JSON에는 UI가 자주 조회하는 모든 필드를 넣기보다 검색·정렬 대상은 정규 컬럼으로 분리
- 실제 삭제 대신 archive를 기본으로 하고 민감 데이터 완전 삭제 절차를 별도로 제공

## 7. API 계약 초안

### 공개 문서 API

| Method | Path                                                            | 역할                                  |
| ------ | --------------------------------------------------------------- | ------------------------------------- |
| `GET`  | `/v1/public/document-publications/:type`                        | 현재 공개 문서의 짧은 inline URL 발급 |
| `GET`  | `/v1/public/document-publications/:type?disposition=attachment` | 현재 공개 문서의 다운로드 URL 발급    |

공개 문서 API에는 인증이 필요하지 않지만 `resume`, `portfolio` 이외의 유형은 거부한다. 응답에는 현재 공개 파일에 접근할 짧은 signed URL과 만료 시각만 포함하고 버전 ID와 Storage 경로는 포함하지 않는다.

### 공개 관리자 API

| Method  | Path                                             | 역할                           |
| ------- | ------------------------------------------------ | ------------------------------ |
| `POST`  | `/v1/document-versions/uploads`                  | 문서 버전과 signed upload 준비 |
| `POST`  | `/v1/document-versions/:id/complete`             | 업로드 검증 및 버전 확정       |
| `GET`   | `/v1/document-versions`                          | 문서 유형별 버전 목록 조회     |
| `PATCH` | `/v1/document-versions/:id`                      | 이름·기본값·archive 상태 변경  |
| `PUT`   | `/v1/document-publications/:type`                | 유형별 현재 공개 버전 지정     |
| `POST`  | `/v1/job-postings`                               | Wanted URL 또는 수동 원문 등록 |
| `GET`   | `/v1/job-postings`                               | 공고 목록 조회                 |
| `GET`   | `/v1/job-postings/:id`                           | 공고 상세 조회                 |
| `POST`  | `/v1/job-postings/:id/collections`               | 자동 또는 수동 원문 수집 접수  |
| `GET`   | `/v1/job-postings/:id/collections`               | 최근 수집 실행·스냅샷 조회     |
| `GET`   | `/v1/job-postings/:id/collections/:collectionId` | 수집 실행 상태 조회            |
| `POST`  | `/v1/analysis-jobs`                              | 비동기 분석 작업 생성          |
| `GET`   | `/v1/analysis-jobs/:id`                          | 작업 상태와 결과 조회          |
| `POST`  | `/v1/analysis-jobs/:id/retry`                    | 실패 작업 수동 재시도          |
| `POST`  | `/v1/analysis-jobs/:id/cancel`                   | 가능한 단계에서 작업 취소      |
| `PATCH` | `/v1/applications/:id`                           | 지원 상태·일정 수정            |

작업 생성 요청에는 `Authorization: Bearer <Supabase access token>`과 `Idempotency-Key`가 필요하다. 응답은 `202 Accepted`와 `jobId`, `requestId`, `statusUrl`을 반환한다.

### 내부 n8n 콜백 API

- `POST /v1/internal/job-posting-collections/:id/complete`: n8n 수집 결과를 양방향 HMAC으로 검증하고 실행 완료와 스냅샷 저장을 원자적으로 처리한다.

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

- [GPT-5.4 Mini 모델](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API Quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)

## 9. 외부 서비스에서 사용자가 준비할 작업

비밀값은 이 문서나 채팅에 붙여 넣지 않고 각 서비스의 Secret/환경변수 저장소에 직접 등록한다.

### Supabase

- [x] 현재 무료 프로젝트의 project ref, region, active status 확인; Storage 사용량·egress는 운영 단계에서 모니터링
- [x] Auth에서 공개 회원가입 비활성화
- [x] 관리자 이메일 사용자 1명 생성
- [x] 개발 `http://localhost:3000`과 운영 Vercel URL을 Site URL/Redirect URL에 등록
- [x] 새 형식 Publishable key(`sb_publishable_...`)와 Secret key(`sb_secret_...`) 생성
- [x] JWT signing key와 JWKS endpoint 확인
- [x] migration으로 `career-documents` 비공개 bucket, 파일 제한, DB 테이블, RLS 적용
- [x] 관리자 JWT로 PDF 업로드가 되고 익명 요청으로 비공개·이전 버전을 읽을 수 없는지 확인

레거시 `anon`, `service_role` 키는 2026년 말 폐기 예정이므로 새 프로젝트에서는 Publishable/Secret 키를 기준으로 한다. Secret key는 RLS를 우회하므로 Worker와 신뢰된 서버에서만 사용한다.

bucket은 Dashboard에서 수동 생성하지 않고 migration으로 재현한다. 버킷 이름과 20MB 제한은 환경별 비밀값이 아니므로 코드·migration에 고정하며, Storage를 위해 별도의 환경변수를 추가하지 않는다. 현재 9.4MB 포트폴리오는 6MB를 넘으므로 resumable upload 대상으로 처리한다.

공식 참고: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [JWT/JWKS](https://supabase.com/docs/guides/auth/jwts), [Storage bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Resumable upload](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

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
- [x] Rate Limiting 기능의 Free plan 한도와 현재 지원 방식을 구현 시점에 확인
- [ ] 로컬 n8n 외부 콜백 시험 시 임시 Tunnel 사용 여부 결정

Cloudflare Pages는 이 프로젝트에서 사용하지 않는다. 공식 참고: [Workers 환경변수와 secrets](https://developers.cloudflare.com/workers/configuration/environment-variables/), [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)

### Vercel

- [ ] 기존 프로젝트 연결 상태와 production domain 확인
- [ ] Development/Preview/Production별 환경변수 등록
- [ ] Supabase Auth redirect URL에 preview domain을 허용할지 결정
- [ ] `NEXT_PUBLIC_*` 값은 브라우저에 노출된다는 점을 확인하고 secret을 넣지 않음

공식 참고: [Vercel Environment Variables](https://vercel.com/docs/environment-variables)

### 로컬 Docker/n8n

- [x] Docker Desktop 또는 호환 Docker Engine 설치·업데이트
- [x] n8n owner 계정용 이메일과 강한 비밀번호 준비
- [x] `openssl rand -hex 32` 등으로 n8n 암호화 키와 callback secret을 각각 생성
- [x] Docker volume backup 위치와 주기 결정
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
| `ADMIN_USER_ID`                        | 서버 전용 | 인증 단계   | 허용할 Supabase 사용자 UUID   |

브라우저 번들에 포함되므로 `NEXT_PUBLIC_*`에는 Secret key, OpenAI key, Slack URL을 절대 넣지 않는다.

Supabase Storage는 같은 프로젝트 URL과 API key를 사용하므로 전용 환경변수가 필요하지 않다. `career-documents` bucket 이름, PDF MIME 제한, 20MB 크기 제한은 migration과 코드 상수로 관리한다.

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
| PDF 개인정보 공개                 | 개인정보 노출       | 원본·이전 버전은 비공개 Storage, 명시적으로 선택한 버전만 공개 |
| 문서 버전 덮어쓰기                | 분석 재현성 상실    | UUID 경로, upsert 금지, 참조된 버전 archive 처리               |
| Supabase 무료 프로젝트 일시정지   | 문서·API 일시 중단  | 실사용 트래픽 확인, 상태 점검과 복구 절차 문서화               |
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
- [ ] 개인정보를 제거한 기술 블로그 글을 게시한다.
- [ ] 측정 가능한 성과를 반영한 이력서·포트폴리오 최신 버전을 공개한다.

## 14. 다음 작업

다음 작업은 **12단계 — 비동기 상태·콜백·재시도**다. 실제 OpenAI, Slack, 운영 n8n이나 배포 환경에 연결하지 않고 fixture와 mock으로 retry 가능한 오류의 지수 backoff, 실패 callback, heartbeat, 수동 재시도, 취소와 오래 멈춘 작업 감지를 먼저 구현한다. 외부 Credential 등록·Workflow 게시·운영 배포는 모든 개발이 끝난 16단계에서 일괄 처리한다.
