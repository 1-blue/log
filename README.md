## 🔥 프로젝트에 대해

### 1️⃣ 프로젝트 목적

프론트엔드 개발자 **박상은**의 개인 기술 블로그

개발 경험, 학습 내용, 프로젝트 회고 등을 기록하고 공유하기 위한 프로젝트

### 2️⃣ 프로젝트 기간

- ✏️ 개인 프로젝트
- ⏱️ 프로젝트 기간: `~진행 중`
- ⛓️ 배포: Vercel (환경변수 `NEXT_PUBLIC_CLIENT_URL` 기준)

### 3️⃣ 주요 기술

1. `Next.js` + `MDX` + `gray-matter`로 마크다운 기반 블로그 콘텐츠 관리
2. `Turborepo` 모노레포로 `blog` 앱과 `ui`, `constants` 패키지 공유
3. `n8n` 셀프 호스팅으로 블로그 포스팅 자동화 워크플로우 구축 (`GCP`, `Docker`, `nginx`, `SSL`)

## 🛠️ 기술 스택

### 1️⃣ Common

| `TypeScript` | `Turborepo` | `pnpm` |
| :--: | :--: | :--: |
| <img src="https://cdn.simpleicons.org/typescript/3178C6" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/turborepo/FF1E56" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/pnpm/F69220" alt="icon" width="75" height="75" /> |

### 2️⃣ FrontEnd (Blog)

| `Next.js` | `Tailwind CSS` | `MDX` | `React` | `shadcn/ui` |
| :--: | :--: | :--: | :--: | :--: |
| <img src="https://cdn.simpleicons.org/nextdotjs/000000" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/tailwindcss/06B6D4" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/mdx/1B1F24" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/react/61DAFB" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/shadcnui/000000" alt="icon" width="75" height="75" /> |

### 3️⃣ Blog 라이브러리

| `remark` | `Prettier` | `Zod` |
| :--: | :--: | :--: |
| <img src="https://cdn.simpleicons.org/remark/000000" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/prettier/F7B93E" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/zod/408AFF" alt="icon" width="75" height="75" /> |

### 4️⃣ Infra & 자동화

| `Vercel` | `n8n` | `GitHub` |
| :--: | :--: | :--: |
| <img src="https://cdn.simpleicons.org/vercel/000000" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/n8n/EA4B71" alt="icon" width="75" height="75" /> | <img src="https://cdn.simpleicons.org/github/181717" alt="icon" width="75" height="75" /> |

## 🤖 n8n 블로그 포스팅 자동화

`n8n`을 GCP e2-micro VM에 셀프 호스팅하여 블로그 포스팅 자동화 워크플로우를 운영해요.

### 1️⃣ 구축 내용

1. **n8n 셀프 호스팅** (GCP, Docker, nginx, Let's Encrypt SSL)

- GCP 무료 티어 VM에 Docker로 n8n 설치
- nginx 리버스 프록시 + HTTPS 도메인 연결
- 상세 가이드: [n8n 셀프 호스팅하기](https://blog.story-dict.com/posts/tools/n8n/n8n-셀프-호스팅하기)

2. **블로그 포스팅 자동화 워크플로우**

- 외부 트리거(스케줄, 웹훅 등)로 실행
- 콘텐츠 소스 연동 후 MDX 포맷으로 변환
- GitHub 저장소에 커밋/푸시하여 배포 파이프라인 연동

### 2️⃣ 관련 블로그

> [n8n 셀프 호스팅하기 (with GCP, Docker, nginx, SSL)](https://blog.story-dict.com/posts/tools/n8n/n8n-셀프-호스팅하기)

## 📁 프로젝트 구조

```
log/
├── apps/
│   └── blog/          # Next.js MDX 블로그 앱
├── packages/
│   ├── ui/            # Shadcn/ui 기반 공유 컴포넌트
│   ├── constants/     # 공유 상수 (ME, sitemap 타입 등)
│   ├── eslint-config/
│   └── typescript-config/
├── turbo.json
└── pnpm-workspace.yaml
```

## 🚀 실행 방법

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 빌드
pnpm build
```

## 📚 문서

### 1️⃣ 블로그

> [박상은 블로그](https://blog.story-dict.com) (배포 URL 기준)

### 2️⃣ 관련 포스트

- [n8n 셀프 호스팅하기](https://blog.story-dict.com/posts/tools/n8n/n8n-셀프-호스팅하기)
- [Next.js MDX 블로그 구축](https://blog.story-dict.com/posts/projects/blog/next-js-mdx)
- [Story Dict 프로젝트 시리즈](https://blog.story-dict.com/series?series=story-dict)
