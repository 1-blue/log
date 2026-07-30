# Bluelog 저장소 지침

## 프로젝트 개요

- 이 저장소는 `pnpm`과 Turborepo를 사용하는 모노레포다.
- `apps/blog`는 Next.js App Router 기반의 한국어 기술 블로그다.
- `packages/ui`, `packages/constants`, `packages/eslint-config`, `packages/typescript-config`는 공유 패키지다.
- 패키지 관리자는 `pnpm`만 사용한다. `npm` 또는 `yarn` lockfile을 만들지 않는다.

## 핵심 구조

- 게시글 원본은 `apps/blog/src/_posts/**/*.mdx`다.
- 게시글의 상대 경로는 `/posts/<상대 경로>` URL, breadcrumbs, 시리즈 분류에 직접 사용된다. 기존 게시글을 이동하거나 이름을 바꿀 때 URL 변경을 명시한다.
- 게시글 frontmatter와 목록 데이터는 `apps/blog/src/libs/post.ts`에서 읽는다.
- 전역 MDX 렌더링 규칙과 사용 가능한 커스텀 컴포넌트는 `apps/blog/mdx-components.tsx`를 기준으로 한다.
- 공용 UI를 추가하기 전에 `packages/ui/src`와 기존 앱 컴포넌트를 먼저 확인한다.
- 생성물인 `node_modules`, `.next`, `.turbo`를 직접 수정하거나 커밋하지 않는다.

## 작업 원칙

- 수정 전 가장 가까운 기존 구현과 관련 타입을 읽고 현재 패턴을 유지한다.
- 사용자의 기존 변경과 무관한 파일을 정리하거나 되돌리지 않는다.
- 요청 범위 밖의 리팩터링, 패키지 추가, 설정 변경을 함께 넣지 않는다.
- 새 프로덕션 의존성은 기존 도구로 해결할 수 없는 경우에만 추가하고 이유를 설명한다.
- 환경 변수나 비밀값을 코드, 문서, 로그에 넣지 않는다. 배포 URL은 `NEXT_PUBLIC_CLIENT_URL`을 사용한다.
- 게시글을 생성하거나 본문, frontmatter, 이미지 구성을 크게 수정할 때는 repo skill `$write-blog-post`를 사용한다.

## 코드 규칙

- TypeScript와 React의 기존 타입·컴포넌트 패턴을 따른다.
- 앱 내부 import는 가능한 경우 `#/*` 별칭을 사용하고, 공유 코드는 `@workspace/*`를 사용한다.
- 서버 컴포넌트를 기본으로 유지하고 브라우저 API, 상태, effect가 필요할 때만 `"use client"`를 추가한다.
- 스타일은 기존 Tailwind CSS와 공유 UI 토큰을 재사용한다.
- 포맷팅만을 위한 대규모 변경을 기능 변경과 섞지 않는다.

## 명령어

저장소 루트에서 실행한다.

```bash
pnpm install
pnpm dev
pnpm --filter blog dev
pnpm --filter blog typecheck
pnpm --filter blog lint
NEXT_PUBLIC_CLIENT_URL=http://localhost:3000 pnpm --filter blog build
pnpm exec prettier --write <변경한 파일>
```

루트 `pnpm format`은 현재 `.mdx`를 포함하지 않으므로 게시글은 대상 파일을 지정해 Prettier를 실행한다.

## 검증

- 문서만 바꾼 경우 링크, 경로, 명령어가 실제 저장소와 일치하는지 확인한다.
- TypeScript 또는 TSX를 바꾼 경우 최소 `pnpm --filter blog typecheck`를 실행한다.
- 렌더링이나 라우팅에 영향을 주는 변경은 lint와 build도 실행한다.
- 새 게시글, 게시글 이동, frontmatter 또는 MDX 컴포넌트 변경은 `$write-blog-post`의 검증 절차를 따른다.
- 실행하지 못한 검증과 그 이유를 최종 응답에 명시한다.

## 코드 리뷰 규칙

- 게시글 경로 변경으로 기존 공개 URL이 깨지는지 확인한다.
- `draft: true` 글이 목록, 정적 경로, sitemap에 노출되지 않는지 확인한다.
- frontmatter 필수값, 한국 시간 날짜 형식, sitemap 값이 유효한지 확인한다.
- 외부 입력을 받는 API 변경에서는 URL 검증, 오류 처리, 비밀값 노출 가능성을 확인한다.
- 자동 검사로 찾을 수 있는 단순 포맷 문제보다 동작, 콘텐츠 정확성, 회귀 위험을 우선한다.
