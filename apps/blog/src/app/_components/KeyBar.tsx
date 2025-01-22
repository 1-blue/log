"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import CommandPalette, {
  filterItems,
  getItemIndex,
  useHandleOpenCommandPalette,
} from "react-cmdk";
import { useTheme } from "next-themes";

import "react-cmdk/dist/cmdk.css";

import { ME } from "@repo/constants";
import { ROUTES, THEMES } from "#/constants";
import type { IPost } from "#/types";

type KeyBarPost = Pick<IPost, "title" | "path">;

interface Props {
  keyBarPosts: KeyBarPost[];
}

/** 초기 게시글 개수 */
const INITIAL_POST_LIMIT = 5;

const KeyBar: React.FC<Props> = ({ keyBarPosts }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [page] = useState<"root">("root");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [posts, setPosts] = useState<KeyBarPost[]>([]);

  // `cmd + k`를 이용해서 검색창 열기 설정
  useHandleOpenCommandPalette(setOpen);

  /** 게시글 목록 초기화 */
  const resetSearchPosts = useCallback(() => {
    setPosts(keyBarPosts.slice(0, INITIAL_POST_LIMIT));
  }, [keyBarPosts]);

  // 최초 게시글 목록 설정 ( `INITIAL_POST_LIMIT`개 )
  useEffect(resetSearchPosts, [resetSearchPosts]);

  /** 게시글 검색 시 실행할 함수 ( `Metadata`의 `title`을 기준으로 검색 ) */
  const onChangeSearch = (keyword: string) => {
    setSearch(keyword);

    // 입력창을 비우면 초기화
    if (keyword.trim().length === 0) return resetSearchPosts();

    setPosts(
      keyBarPosts.filter((keyBarPosts) => keyBarPosts.title.includes(keyword)),
    );
  };

  const githubLinkRef = useRef<null | HTMLAnchorElement>(null);

  const filteredItems = useMemo(
    () =>
      filterItems(
        [
          // 게시글
          {
            id: "posts",
            heading: "게시글",
            items: posts.map((post) => ({
              id: post.title,
              children: post.title,
              icon: "DocumentTextIcon",
              onClick: () => router.push(post.path),
            })),
          },
          // 페이지
          {
            id: "pages",
            heading: "페이지",
            items: ROUTES.map((route) => ({
              id: route.path,
              children: route.label,
              icon: route.path === pathname ? route.Solid : route.Outline,
              onClick: () => router.push(route.path),
            })),
          },
          // 테마
          {
            id: "theme",
            heading: "테마",
            items: THEMES.map((theme) => ({
              id: theme.value,
              children: theme.label,
              icon: theme.Icon,
              onClick: () => setTheme(theme.value),
            })),
          },
          // 내 정보
          {
            id: "information",
            heading: "개발자 정보",
            items: [
              {
                id: "github",
                children: "깃허브 ( 1-blue )",
                icon: "CodeBracketIcon",
                onClick: () => githubLinkRef.current?.click(),
              },
              {
                id: "email",
                children: `이메일 ( ${ME.EMAIL} )`,
                icon: "EnvelopeOpenIcon",
                href: `mailto:${ME.EMAIL}`,
              },
              {
                id: "phone",
                children: `휴대폰 번호 ( ${ME.PHONE} )`,
                icon: "PhoneIcon",
                href: `tel:${ME.PHONE}`,
              },
            ],
          },
        ],
        search,
      ),
    [posts, search, pathname, router, setTheme],
  );

  return (
    <>
      <a
        href={ME.GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="hidden"
        tabIndex={0}
        ref={githubLinkRef}
      />

      <button
        type="button"
        className="btn btn-ghost space-x-2"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="text-sm">검색 ...</span>
        <span className="kbd text-xs">⌘ K</span>
      </button>

      <CommandPalette
        onChangeSearch={onChangeSearch}
        search={search}
        onChangeOpen={setOpen}
        isOpen={open}
        page={page}
        placeholder="ex) Akaps"
      >
        <CommandPalette.Page id="root">
          {filteredItems.length ? (
            filteredItems.map((list) => (
              <CommandPalette.List key={list.id} heading={list.heading}>
                {list.items.map(({ id, ...rest }) => (
                  <CommandPalette.ListItem
                    key={id}
                    index={getItemIndex(filteredItems, id)}
                    {...rest}
                  />
                ))}
              </CommandPalette.List>
            ))
          ) : (
            <CommandPalette.FreeSearchAction />
          )}
        </CommandPalette.Page>
      </CommandPalette>
    </>
  );
};

export default KeyBar;
