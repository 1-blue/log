"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BriefcaseBusinessIcon,
  FileStackIcon,
  LayoutDashboardIcon,
} from "lucide-react";

const items = [
  { href: "/admin", icon: LayoutDashboardIcon, label: "대시보드" },
  { href: "/admin/documents", icon: FileStackIcon, label: "문서 관리" },
  {
    href: "/admin/applications",
    icon: BriefcaseBusinessIcon,
    label: "지원 관리",
  },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="관리자 메뉴" className="flex gap-2 lg:flex-col">
      {items.map(({ href, icon: Icon, label }) => {
        const active =
          href === "/admin"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "bg-primary text-primary-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            }
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
