# 아키텍처 연결 교정

생성 방식: 내장 이미지 생성 도구. 기존 참고 스타일 이미지의 연결 교정.

최종 이미지: `apps/blog/public/images/posts/projects/career-ops/2026-09-22-분석-성공-기준-다시-정하기/career-ops-architecture-corrected.png`

시각 검수: 관리자 → Next.js, 로그인 → Auth, PDF 직접 업로드 → Storage, Workers ↔ 서비스 PostgreSQL, n8n → Slack, n8n ↔ 전용 PostgreSQL 연결 확인. 외부 서비스 화살표는 호출 방향을 중심으로 표시하며 HTTP 응답 경로는 생략했다. CI/CD는 구성 설명으로 운영 검증 완료를 주장하지 않는다.

```text
Use case: precise-object-edit / architecture diagram correction.
The attached image is the EDIT TARGET. Preserve its overall traditional infrastructure diagram style, pastel rectangular groups, logos, gray arrow style, Korean labels, CI/CD panel and landscape format. Produce a clean high-resolution opaque PNG for publication. Correct connections carefully, not just labels.

MANDATORY CORRECTIONS:
A. Administrator HTTPS: move the administrator icon ABOVE the Next.js/Vercel column, and draw its downward HTTPS arrow all the way to the Next.js icon/box. It must not terminate at the generic service boundary above Cloudflare.
B. Supabase: rearrange its three subcomponents LEFT TO RIGHT as "Auth", "Storage · PDF", "PostgreSQL". Use a simple green outlined folder/document icon for Storage, NOT an Amazon S3 bucket logo.
Delete the old branched line labeled "로그인 · PDF 업로드".
Draw TWO separate paths from the BOTTOM of Next.js:
  - a short down-left elbow arrow ending precisely at Auth, caption "로그인".
  - a separate down-right elbow arrow ending precisely at Storage, caption "PDF 직접 업로드".
These paths may enter the Supabase boundary but must clearly terminate at the corresponding icon, not the group border. Next.js MUST NOT have a direct connection to PostgreSQL.
C. Workers data connection: route Workers API vertically down to the RIGHTMOST Supabase PostgreSQL icon with arrowheads at both ends and caption "④ 데이터 저장·조회". This arrow must terminate at the database icon. Do not join it to either frontend path. Keep ample separate lanes.
D. Slack: DELETE the existing horizontal connector at the height of the n8n PostgreSQL elephant. There must be NO line from the elephant/database to Slack.
Instead draw a connector originating visibly at the RIGHT SIDE OF THE n8n coral logo, first running right into a free routing lane, then downward and right to Slack. Its arrowhead points INTO Slack only, caption "알림". Give this route its own lane. The n8n PostgreSQL must have only ONE internal bidirectional link, to n8n itself. It has no external edges.
For clarity, reflow the external services group or widen the drawing as needed to prevent overlap between the n8n-to-Wanted, n8n-to-OpenAI and n8n-to-Slack connectors. All three must clearly originate from n8n, not its DB or a generic box edge.
E. Keep HMAC task arrow Workers->n8n and HMAC callback n8n->Workers on distinct parallel routes, with endpoints at the actual components.
F. Keep n8n PDF signed-URL explanatory note, and keep separate n8n DB versus Supabase DB. Keep Caddy HTTPS and Docker Compose nested inside AWS Lightsail.

Preserve CI/CD panel as an independent schematic, no unrelated infrastructure. Do not add S3, EC2, VPC, ALB, RDS. Main service boundary remains a logical grouping. No extra text, repeated titles, invented services. All Korean legible. This is a correctness edit: prioritize precise source/destination arrow endpoints over exact prior node positions.
```
