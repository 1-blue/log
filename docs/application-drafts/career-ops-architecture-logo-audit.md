# Career Ops 아키텍처 로고 교정

검토일: 2026-09-26

## 결과

- 원본: `career-ops-architecture-no-legend.png`
- 산출물: `career-ops-architecture-brand-checked.png` (1586 × 992 PNG)
- Wanted: 잘못된 파란 W와 임의 소문자 표기를 공식 다색 심볼 및 단일 캡션으로 교체.
- n8n: 두 곳의 심볼과 워드마크를 공식 가로 배치에 가깝게 수정하고 중복 이름 제거.
- Cloudflare Workers: 출처가 불명확한 주황 육각형을 Cloudflare 공식 기업 심볼로 교체. Workers 전용 제품 로고라고 표기하지 않음.
- Slack: 공식 다색 심볼과 대조. 기존 표현 유지.
- GitHub, Next.js, PostgreSQL, Supabase: 공식 자료와 형태를 대조. 기존 표현 유지.
- Vercel, OpenAI: 브랜드 가이드와 대조. 기존 표현 유지.
- GitHub Actions, Auth, Storage, HTTPS 자물쇠, 관리자: 기능 설명용 그림. 기업 공식 로고가 아님.
- AWS Lightsail, Docker Compose: 영역 제목. 로고를 추가하지 않음.
- 내장 imagegen으로 편집. 상표 원본을 픽셀 단위로 합성한 결과는 아니므로 확대 사용 전 원본과 최종 대조가 필요함.

## 공식 출처

- Wanted: https://www.wanted.co.kr/brandcenter/ — 심볼: https://www.wanted.co.kr/brandcenter/assets/img/logo/2/pc/1-1.png
- n8n: https://n8n.io/brandguidelines/
- Cloudflare: https://www.cloudflare.com/press/press-kit/
- GitHub: https://brand.github.com/foundations/logo
- Next.js / Vercel: https://vercel.com/geist/brands
- PostgreSQL: https://www.postgresql.org/media/img/about/press/elephant.png
- Slack: https://slack.com/media-kit
- Supabase: https://supabase.com/brand-assets
- OpenAI: https://openai.com/brand/

## 사용한 이미지 생성 프롬프트

첫 번째 편집은 기존 아키텍처 PNG를 편집 대상으로 하고 Wanted, n8n, Cloudflare, Slack 공식 로고 자료를 순서대로 참조했다.

```text
Use case: precise-object-edit. Asset: landscape raster Career Ops architecture diagram for a Korean blog and portfolio. Edit IMAGE 1 only, treating images 2-5 as official logo references. Preserve image 1's exact layout, Korean text, flow arrow directions, connector topology, pastel group boundaries, labels, and absent footer legend.

Change only these logo regions:
(1) At top of far-right external services column, remove the blue W symbol and invented lowercase "wanted". Insert the exact multicolored Wanted ribbon symbol from IMAGE 2, with its left triangular loop, tall central arch and right round loop. Use a SINGLE caption "Wanted" under the symbol. Do not draw a W or extra wordmark.
(2) In both n8n positions (main Docker Compose area, and small CI/CD deployment item), place the horizontal official lockup from IMAGE 3: pink branching mark immediately LEFT of black "n8n" wordmark, aligned in one row. Keep other explanatory labels below. Do not stack icon and wordmark or duplicate "n8n".
(3) In both Cloudflare Workers positions (main Workers API and small CI/CD Workers deployment item), replace the invented orange polygon/hexagon symbol with the exact official orange Cloudflare CLOUD mark from IMAGE 4. Preserve existing "Workers API"/"Workers" captions. This depicts the provider, not an invented Workers product logo.
(4) The Slack logo already has the correct four-color mark but compare it with IMAGE 5 and correct only if necessary.
All other brand marks, functional pictograms, labels, line routes, numbered steps and architecture explanations should remain visually intact. No extraneous logo, no new text, no footer or legend. Maintain a sharp flat Figma-like quality, high resolution, same aspect ratio. No visual changes outside specific logo regions.
```

두 번째 편집은 첫 번째 결과의 n8n 중복 이름만 제거했다.

```text
Use case: precise-object-edit. Edit the attached Career Ops architecture PNG as a surgical text cleanup. Remove ONLY the two redundant standalone "n8n" captions positioned directly BELOW the new horizontal pink-icon-plus-black-n8n lockups: one in the center-right Docker Compose panel, one in the lower-left deployment panel. Keep the two horizontal official n8n lockups exactly as they are. In center-right, keep "수집 · AI 호출 · 알림" and "PDF: Supabase 서명 URL로 읽기". In lower-left, keep "Workflow 게시" directly below the lockup. Preserve ALL other pixels and especially the Wanted multicolor symbol, Cloudflare orange cloud symbols, every other label, arrows, group boundaries, layout, aspect ratio and absent footer legend. Do not redraw or change any logo. Do not add any new text.
```
