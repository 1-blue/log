---
name: blog-mdx-base-template
description: Generates base MDX blog structure for posts under apps/blog/src/_posts with consistent frontmatter and readable section layout. Use when creating new technical or retrospective blog posts, scaffolding post templates, or asking for default MDX format.
---

# Blog MDX Base Template

## 목적

`apps/blog/src/_posts` 내부 포스트들의 공통 패턴에 맞춰 MDX 기본 형식을 만든다.

## 공통 Frontmatter

신규 포스트 생성 시 아래 구조를 기본으로 사용한다.

```yaml
---
title: "포스트 제목"
description: "포스트 설명"
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

## 필드 규칙

- 필수: `title`, `description`, `tags`, `createdAt`, `publishedAt`, `sitemap`, `draft`
- 선택: `icon`, `thumbnail` (기존 글 중 생략된 케이스가 있으나 신규 기본형에는 포함)
- `sitemap.changefreq`는 기본 `weekly`
- `sitemap.priority`는 기본 `0.5` (필요 시 주제에 따라 조정)
- `createdAt`은 오늘 날짜 및 시간 적용
- `publishedAt`은 오늘 날짜 및 시간 적용

## 본문 기본 패턴

아래 순서를 기본으로 사용하되, 주제에 맞게 제목은 조정한다.

1. 한 줄 소개(선택): `> ...`
2. 문제/배경
3. 핵심 내용(2~4개 섹션)
4. 예시 코드/이미지/링크
5. 정리

## 기본 템플릿

```mdx
> 이 글에서 다루는 내용 한 줄 요약

## 🤔 문제/배경

### 0️⃣ 왜 이 주제를 다루는가

### 1️⃣ 기존 방식의 한계

## ⚙️ 해결 방법

### 0️⃣ 핵심 아이디어

### 1️⃣ 적용 방법

## 🧪 예시

### 0️⃣ 코드/설정 예시

### 1️⃣ 적용 결과

## 📝 정리

### 0️⃣ 핵심 요약

### 1️⃣ 다음 액션
```

## 헤더 스타일 가이드

- 기본 권장:
  - `## {이모지} {제목}`
  - `### {숫자이모지} {서브제목}`
- 기존 글 호환:
  - 이모지 없는 `## 제목`, `### 제목`도 허용

## 출력 스타일

- 한국어로 작성
- 문단은 짧고 읽기 쉽게 유지
- 과장 표현보다 구체적 근거/경험 중심
