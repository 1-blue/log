# Frontmatter와 경로 규칙

## 경로가 결정하는 값

게시글 루트는 `apps/blog/src/_posts`다. 이 아래의 상대 경로에서 확장자만 제거해 공개 URL을 만든다.

```text
apps/blog/src/_posts/tools/n8n/셀프-호스팅하기.mdx
→ /posts/tools/n8n/셀프-호스팅하기
→ breadcrumbs: ["tools", "n8n", "셀프-호스팅하기"]
→ 시리즈 그룹: tools
```

- 첫 번째 디렉터리는 `/series`의 그룹 키로 사용된다.
- 디렉터리와 파일명에는 한글을 사용할 수 있다.
- 기존 글을 이동하거나 이름을 바꾸면 공개 URL이 바뀐다. 명시적 요청 없이 경로를 정리하지 않는다.
- `ai` 디렉터리의 새 글은 기존 관례인 `YYYY-MM-DD-kebab-case.mdx`를 따른다.
- 다른 디렉터리는 가까운 형제 글의 파일명 관례를 우선한다.

## 기본 스키마

신규 글에는 다음 구조를 사용한다.

```yaml
---
title: "포스트 제목"
description: "본문에서 실제로 답하는 내용을 한두 문장으로 설명"
tags: ["태그1", "태그2"]
icon: ""
thumbnail: ""
createdAt: YYYY-MM-DD HH:mm:ss
publishedAt: YYYY-MM-DD HH:mm:ss
sitemap:
  lastmod: YYYY-MM-DD HH:mm:ss
  changefreq: weekly
  priority: 0.5
draft: false
---
```

| 필드                 | 규칙                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `title`              | 구체적인 글 제목. 일반 글에는 AI 표시를 붙이지 않는다.                                |
| `description`        | 검색 결과와 카드에 사용할 독립적인 설명. 줄바꿈이 필요하면 YAML 문자열 문법을 지킨다. |
| `tags`               | 본문에 실제로 등장하는 핵심 기술과 주제만 사용한다. 중복과 의미가 같은 변형을 피한다. |
| `icon`               | 신규 글에는 필드를 포함한다. 별도 아이콘이 없으면 빈 문자열을 사용한다.               |
| `thumbnail`          | 정적 이미지 URL 또는 빈 문자열. 빈 값이면 동적 썸네일을 생성한다.                     |
| `createdAt`          | 최초 작성 한국 시간. 기존 글 수정 시 유지한다.                                        |
| `publishedAt`        | 최초 공개 한국 시간. 재발행 요청이 없으면 유지한다.                                   |
| `sitemap.lastmod`    | 의미 있는 본문 수정 시 현재 한국 시간으로 갱신한다.                                   |
| `sitemap.changefreq` | 기본값은 `weekly`다.                                                                  |
| `sitemap.priority`   | 기본값은 `0.5`, 허용 범위는 0.0~1.0이다.                                              |
| `draft`              | 완성된 글은 `false`, 미완성 또는 비공개 글은 `true`다.                                |
| `ai`                 | AI 컬렉션 글에만 `true`를 추가한다.                                                   |

`draft: true`인 글은 기본 게시글 목록, 정적 게시글 경로와 sitemap에서 제외된다.

## AI 컬렉션

AI 글은 코드상 `ai: true`이거나 첫 번째 breadcrumb가 `ai`이면 분류된다. 새 글에서는 혼선을 막기 위해 두 조건을 함께 사용한다.

```yaml
title: "[🤖] 포스트 제목"
ai: true
```

본문 첫 부분에 투명한 고지를 추가한다.

```mdx
<Blockquote type="info">
  🤖 이 글은 AI를 활용해 작성했으며, 게시 전에 내용을 검토했어요. 실무 적용
  전에는 연결된 공식 문서를 함께 확인해 주세요.
</Blockquote>
```

- 사용자가 AI 컬렉션 글을 요청하거나 기존 AI 글을 수정할 때만 적용한다.
- 실제로 사용한 모델이 확인되지 않았다면 특정 모델명을 쓰지 않는다.
- 가상의 저자 경력이나 사람인 것처럼 보이는 자기소개를 만들지 않는다.

## 썸네일과 이미지 경로

- `thumbnail: ""` 또는 필드 누락 시 `/api/thumbnail`이 제목, 설명, 작성일로 이미지를 만든다.
- 정적 썸네일은 `/images/posts/...`처럼 `public` 기준 URL을 사용한다.
- 본문 이미지는 가급적 게시글 상대 경로와 대응시킨다.

```text
글: apps/blog/src/_posts/aws/lambda/image-resize.mdx
이미지: apps/blog/public/images/posts/aws/lambda/image-resize/01-example.png
MDX: ![설명](/images/posts/aws/lambda/image-resize/01-example.png)
```

이미지 파일을 추가할 때 의미 있는 대체 텍스트를 작성하고, 존재하지 않는 경로를 추측하지 않는다.
