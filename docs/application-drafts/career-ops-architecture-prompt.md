# Career Ops 아키텍처 이미지 생성 프롬프트

생성 방식: 내장 이미지 생성 도구. 블로그·면접 설명용 PNG.

## 검수 후 수정 프롬프트

```text
Edit this architecture diagram, preserving all cards, logos, Korean labels, composition and deployment section. Two critical corrections:
1. Make the ENTIRE canvas a completely opaque solid very pale cool white #F8FAFC. No transparency anywhere. All black/transparent-looking empty areas must become that continuous white background. Redraw any noisy/haloed text and connectors sharply; navy type must be clean and highly legible on white. No distressed edges, speckles or transparency.
2. DELETE the entire bottom blue connection from Supabase Storage to AWS PostgreSQL and DELETE its label "서명 URL로 PDF 읽기". There must be NO connection from Supabase to the n8n PostgreSQL card. Keep the internal n8n <-> PostgreSQL arrow. Instead add a small subtitle INSIDE the n8n card, below "수집 · AI 호출 · 알림", reading "Supabase의 PDF를 서명 URL로 읽기". Do not draw a new edge for PDF, this concise note is sufficient.
Everything else remains the same. Keep request Worker->n8n and callback n8n->Worker arrows separate and accurate. Output a crisp professional opaque PNG raster infographic with a consistent clean white background.
```

## 최종 텍스트 교정 프롬프트

```text
Precise text-only correction of the attached architecture diagram. Preserve all pixels/layout/logos/cards/arrows/background and every other label as closely as possible. Replace only three connection captions:
1. The vertical arrow between Cloudflare Workers and Supabase currently captioned "사용자 인증/권한 확인" must instead read exactly "서비스 데이터 저장·조회". This is the crucial business database persistence connection.
2. The upper horizontal Worker-to-n8n arrow caption must read exactly "서명된 작업 요청".
3. The lower n8n-to-Worker return arrow caption must read exactly "서명된 결과 callback".
Do not change any other text. Keep the opaque white background, razor-sharp navy Korean text, blue arrows, wide landscape design. No new arrows, no new elements.
```

최종 파일: `apps/blog/public/images/posts/projects/career-ops/2026-09-22-분석-성공-기준-다시-정하기/career-ops-architecture.png`

핵심 구성 설명용이며 배포 흐름은 코드 구성 기준이다. 운영 배포 검증 완료를 의미하지 않는다.

```text
Use case: infographic-diagram.
Create a polished high-resolution landscape raster system architecture diagram for a Korean developer's blog and engineering interview. Figma-crafted professional editorial diagram, white/off-white canvas, dark navy typography, subtle pale tinted grouping boxes, rounded rectangles, thin crisp borders, generous consistent spacing, extremely legible text. Flat UI, not 3D, no perspective. Wide 16:9 composition. Use recognizable vendor logos next to product names, accurate brand colors: Vercel triangle, Next.js N, Cloudflare Workers orange mark, n8n coral connected nodes, AWS Lightsail, Docker whale, PostgreSQL elephant, Supabase green bolt, OpenAI knot, Slack multicolor mark, GitHub Octocat and Actions. Wanted can use a simple blue wordmark. No S3 or invented infrastructure.

Title upper left: "Career Ops"
Subtitle: "AI 기반 취업 준비 서비스 아키텍처"
Small top-right capsule: "공고 수집 · 문서 분석 · 적합도 평가"

MAIN AREA (top 75%): arranged left-to-right, with precise orthogonal arrows that terminate on cards, no edges through text.
Left card "관리자" browser icon, containing "Next.js" and Vercel logo label "Vercel"; small subtitle "공고 · PDF 등록 / 결과 확인".
Middle card "Cloudflare Workers" subtitle "API · 인증 · 검증 · 상태 관리".
Right-middle larger pale coral boundary labeled "AWS Lightsail", with small Docker logo label "Docker Compose · Caddy HTTPS". Inside prominently "n8n" subtitle "수집 · AI 호출 · 알림"; below it a smaller PostgreSQL card "PostgreSQL" and "n8n 실행·설정 데이터". A short connection n8n to PostgreSQL stays inside boundary.
Far right vertically stacked three equal small cards:
"Wanted" / "공고 본문 수집"
"OpenAI" / "문서·공고·적합도 분석"
"Slack" / "결과·오류 알림"

Draw main edges:
관리자/Next.js -> Workers: blue solid arrow labeled "인증된 API 요청".
Workers -> n8n: blue solid arrow upper track labeled "서명된 작업 요청".
n8n -> Workers: separate blue solid arrow lower track labeled "서명된 결과 callback".
n8n -> Wanted, n8n -> OpenAI, n8n -> Slack: clear blue solid connectors branching only near external cards. Small bidirectional arrowheads on Wanted and OpenAI edges to indicate responses; Slack outbound only.

Below frontend and Workers, a wide green-tinted Supabase box titled "Supabase" containing three simple sublabels "Auth" / "PostgreSQL" / "Storage · PDF". Secondary subtitle "관리자 인증 · 서비스 데이터 · 문서 보관".
Connections: frontend to Supabase labeled "로그인 · PDF 업로드"; Workers bidirectionally connected to Supabase labeled "검증된 결과 저장 / 조회"; Supabase Storage to n8n with thin blue arrow following an outer lower route labeled "서명 URL로 PDF 읽기". Keep every edge readable and distinct. These support paths must not cross labels or deployment area.

BOTTOM 20%: separated cleanly by a divider and title "배포 구성". This is an independent schematic, no lines running up through main diagram. Two lanes:
"GitHub · master" dashed gray arrow to "Vercel Git 연동" dashed arrow to "Next.js 배포".
"GitHub · master / 수동 실행" dashed gray arrow to "GitHub Actions" then fork to two destination pills "Worker 배포" and "n8n Workflow 게시".
Small legend: solid blue line "서비스 흐름"; dashed gray line "배포 흐름".
Footer small text: "핵심 흐름 중심 · Supabase DB와 n8n DB는 별도 구성"
Do not add unrelated text, performance claims, success badges, URLs, secrets, model names or additional services. Do not duplicate cards. Make logos tasteful 28-40px visual weight and titles clear. Prioritize readable Korean and routing clarity over decorative detail.
```
