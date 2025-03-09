"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { DocumentTextIcon as ODocumentTextIcon } from "@heroicons/react/24/outline";
import { DocumentTextIcon as SDocumentTextIcon } from "@heroicons/react/24/solid";
import { GithubIcon, MailIcon, SmartphoneIcon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/Command";
import { Button } from "@workspace/ui/components/Button";
import { ME } from "@workspace/constants";
import { ROUTES, THEMES } from "#/constants";
import type { IPost } from "#/types";

type KeyBarPost = Pick<IPost, "title" | "path">;

interface Props {
  keyBarPosts: KeyBarPost[];
}

const KeyBarOption: React.FC<Props> = ({ keyBarPosts }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const githubLinkRef = useRef<null | HTMLAnchorElement>(null);

  const filteredItems = useMemo(
    () => [
      // 게시글
      {
        id: "posts",
        heading: "게시글",
        items: keyBarPosts.map((post) => ({
          id: post.title,
          title: post.title,
          Icon:
            decodeURI(post.path) === decodeURI(pathname)
              ? SDocumentTextIcon
              : ODocumentTextIcon,
          onClick: () => router.push(post.path),
        })),
      },
      // 페이지
      {
        id: "pages",
        heading: "페이지",
        items: ROUTES.map((route) => ({
          id: route.path,
          title: route.label,
          Icon: route.path === pathname ? route.Solid : route.Outline,
          onClick: () => router.push(route.path),
        })),
      },
      // 테마
      {
        id: "theme",
        heading: "테마",
        items: THEMES.map((theme) => ({
          id: theme.value,
          title: theme.label,
          Icon: theme.Icon,
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
            title: "깃허브 ( 1-blue )",
            Icon: GithubIcon,
            onClick: () => githubLinkRef.current?.click(),
          },
          {
            id: "email",
            title: `이메일 ( ${ME.EMAIL} )`,
            Icon: MailIcon,
            href: `mailto:${ME.EMAIL}`,
          },
          {
            id: "phone",
            title: `휴대폰 번호 ( ${ME.PHONE} )`,
            Icon: SmartphoneIcon,
            href: `tel:${ME.PHONE}`,
          },
        ],
      },
    ],
    [keyBarPosts, pathname, setTheme, router],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

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

      <Button
        variant="ghost"
        size="sm"
        className="cursor-pointer"
        onClick={() => {
          console.log("click");
          setOpen(true);
        }}
      >
        <kbd className="flex items-center gap-1">
          <span className="text-sm">⌘</span>
          <span className="text-xs">K</span>
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="ex) Next.js" />
        <CommandList>
          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>

          {filteredItems.length ? (
            filteredItems.map((list) => (
              <CommandGroup key={list.id} heading={list.heading}>
                {list.items.map(({ id, title, onClick, Icon }) => (
                  <CommandItem
                    key={id}
                    role="button"
                    onSelect={() => {
                      onClick?.();
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Icon className="size-4" />
                    {title}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          ) : (
            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default KeyBarOption;
