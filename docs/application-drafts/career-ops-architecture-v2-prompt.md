# Career Ops 아키텍처 이미지 v2

내장 이미지 생성 도구 사용. 사용자 첨부 이미지는 스타일 참고이며 인프라 구성은 복사하지 않는다.

```text
Use case: infographic-diagram.
Image 1 is STYLE AND LAYOUT REFERENCE ONLY, not this service's infrastructure. Create a NEW raster architecture diagram for "Career Ops" closely matching its traditional AWS architecture drawing style: large pastel rectangular system boundaries with tiny colored labels attached at upper-left, freestanding authentic brand icons with compact captions underneath, thin neutral-gray elbow connectors with rounded corners, gray numbered circle badges, white/light gray opaque canvas, no shadows, no gradients, no decorative illustration, no large presentation title, no rounded UI cards. Use clean readable Korean and English typography. Landscape 16:10, high-resolution, generous routing lanes. This should resemble a carefully composed Figma/draw.io infrastructure diagram, NOT a marketing infographic.

Small title tab at top-left of outer frame: "Career Ops · Service Architecture".
Left 25% of page: isolated white bordered "CI/CD" zone.
Upper green subzone labeled "검증": GitHub icon caption "GitHub · master / 수동 실행", arrow down to GitHub Actions icon caption "테스트 · 타입 검사 · 빌드".
Lower blue subzone labeled "배포 구성": top small label "검증 통과 후"; GitHub Actions icon, branching dashed arrows to two compact icons with labels "Workers 배포" and "n8n Workflow 게시". Also separate GitHub -> Vercel small connection labeled "Git 연동 배포". This CI/CD zone is an overview: do not draw connectors across into runtime zone. Small footnote inside left column "자동·수동 배포 구성".

Right 72%: main runtime zone. At top outside its boundary a user silhouette caption "관리자", gray arrow down caption "HTTPS" to Frontend.
Large pale lavender outer boundary labeled "서비스 구성 · 논리적 경계". This is a logical grouping NOT a VPC.
Within it, top-left smaller pale green rectangle labeled "Vercel", containing large Next.js icon caption "Next.js" and small line "관리자 화면".
Top-middle smaller pale blue rectangle labeled "Cloudflare", containing Workers icon caption "Workers API" and "인증 · 검증 · 상태 관리".
Top-right/middle larger pale orange rectangle labeled "AWS Lightsail". Inside top a small Caddy icon or text "Caddy · HTTPS"; below nested light green rectangle labeled "Docker Compose", containing n8n logo caption "n8n" / "수집 · AI 호출 · 알림"; below PostgreSQL elephant caption "PostgreSQL" / "n8n 전용 DB". Internal simple arrow n8n <-> PostgreSQL, no other component connects directly to this database.
At far right of main service boundary, narrow white rectangle labeled "외부 서비스", vertically stacked logos: Wanted / OpenAI / Slack. Align these to n8n and draw short distinct n8n connections: Wanted bidirectional labeled "본문", OpenAI bidirectional labeled "AI", Slack outgoing labeled "알림".
At bottom-left of the main service boundary a broad pale green rectangle labeled "Supabase", containing three equally spaced freestanding symbols with captions "Auth", "PostgreSQL", "Storage · PDF"; use Supabase lightning logo at group corner. Lower note "서비스 데이터 · 문서 보관".

Main numbered runtime connectors:
1 Next.js -> Workers API, label "분석 요청". Arrow horizontally across a clear gap.
2 Workers API -> n8n, label "HMAC 작업 요청". Use upper route.
3 n8n -> Workers API, label "HMAC 결과 callback". Use distinct lower return route, not overlapping forward arrow.
4 Workers API <-> Supabase PostgreSQL, label "검증된 결과 저장·조회". Route down.
Additional thin gray links: Next.js -> Supabase Auth / Storage labeled "로그인 · PDF 업로드" routed down left. No direct Next.js write link to database.
To avoid crowded connectors, simply place inside n8n area small note "PDF: Supabase 서명 URL로 읽기" instead of drawing Storage-to-n8n line.
Do NOT include S3, EC2, ECR, ACM, Route 53, Internet Gateway, VPC, Subnet, ALB, RDS, Redis, Kubernetes from the reference; none is part of this service. AWS Lightsail hosts only n8n plus its internal database and HTTPS proxy, NOT frontend or Worker. Supabase business database is clearly separate from n8n database.
Footer: gray solid line symbol "서비스 흐름" and dashed line symbol "배포 흐름"; small sentence "핵심 연결 중심 · 배포는 구성 기준".
Maintain very clear nonoverlapping edges and consistent icon sizing. Faithful known service logos, pastel boundaries, dense but readable like reference. Fully opaque light background.
```
