import Link from "next/link";
import type { ImageProps } from "next/image";
import type { MDXComponents } from "mdx/types";

import { cn } from "@repo/ui/utils";

import Pre from "#/components/mdx/Pre";
import Blockquote from "#/components/mdx/Blockquote";
import Heading from "#/components/mdx/Heading";
import Image from "#/components/mdx/Image";
import LinkPreviewCard from "#/components/mdx/LinkPreviewCard";

/** 모든 `.mdx`에 적용 ( `next.js`에서 약속된 이름 ) */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => (
      <Heading.H1
        {...props}
        id={(props.children as string).replaceAll(" ", "-").toLowerCase()}
      />
    ),
    h2: (props) => {
      const { children } = props;

      // 존재하지 않는 경우 ( `TS`라서 예외처리 )
      if (typeof children !== "string") return;

      // metadata를 없앨수가 없어서 강제로 렌더링하지 않음
      // ( 이유는 모르겠지만 h2로 변환됨 )
      if (children.includes("changefreq: ")) return;

      return (
        <Heading.H2
          {...props}
          id={(props.children as string).replaceAll(" ", "-").toLowerCase()}
        />
      );
    },
    h3: (props) => (
      <Heading.H3
        {...props}
        id={(props.children as string).replaceAll(" ", "-").toLowerCase()}
      />
    ),
    h4: (props) => (
      <Heading.H4
        {...props}
        id={(props.children as string).replaceAll(" ", "-").toLowerCase()}
      />
    ),
    h5: (props) => (
      <Heading.H5
        {...props}
        id={(props.children as string).replaceAll(" ", "-").toLowerCase()}
      />
    ),
    h6: (props) => (
      <Heading.H6
        {...props}
        id={(props.children as string).replaceAll(" ", "-").toLowerCase()}
      />
    ),
    img: (props) => (
      <Image
        {...(props as ImageProps)}
        fill
        alt={props.alt || "블로그 이미지"}
        layoutId={props.src as string}
      />
    ),
    /** 코드 블럭 */
    pre: (props) => (
      <Pre {...props} className={cn(props.className, "!mb-4 mt-2")} />
    ),
    /** 코드 */
    code: ({ children, className, ...restProps }) => (
      <code
        {...restProps}
        className={cn(
          typeof children === "string" &&
            "rounded-sm bg-custom-less px-[5px] py-0.5 text-sm font-semibold text-main-400 dark:text-main-500",
          className
        )}
      >
        {children}
      </code>
    ),
    /** 리스트 */
    ol: ({ children, ...restProps }) => (
      <ol
        {...restProps}
        className="mb-4 mt-2 list-decimal space-y-1 pl-10 [ol_&]:mt-1 [blockquote_&]:pl-5"
      >
        {children}
      </ol>
    ),
    /** 리스트 */
    ul: ({ children, ...restProps }) => (
      <ul
        {...restProps}
        className="mb-4 mt-2 list-disc space-y-1 pl-10 group-has-[ul]:my-0 group-has-[ul]:pl-7 [blockquote_&]:pl-5"
      >
        {children}
      </ul>
    ),
    /** 링크 */
    a: ({ href, children, className, ...restProps }) => (
      <Link
        {...restProps}
        href={href!}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "font-semibold text-main-500 underline underline-offset-2 transition-colors hover:text-main-600",
          className
        )}
      >
        {children}
      </Link>
    ),
    /** 인용 블럭 */
    blockquote: (props) => <Blockquote {...props} />,
    /** 수평라인 ( 메타데이터를 사용하는 부분과 문법이 같은데 파싱할때 제외가 안되어서 아예 제거 `---` ) */
    hr: () => null,
    /** 문장 사이의 간격 지정 */
    p: (props) => (
      <p
        {...props}
        className={cn(props.className, "!mb-3 [blockquote_&]:!mb-0")}
      />
    ),

    /** 링크 미리보기 카드 */
    LinkPreviewCard,
    /** 인용 블럭 */
    Blockquote,
    ...components,
  };
}
