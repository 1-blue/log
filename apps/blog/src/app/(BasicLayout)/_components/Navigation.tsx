"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { HomeIcon as HomeOutlineIcon } from "@heroicons/react/24/outline";
import { HomeIcon as HomeSolidIcon } from "@heroicons/react/24/solid";

import { cn } from "@workspace/ui/lib/utils";
import { ROUTES } from "#/constants";

const routes = [
  { path: "/", label: "메인", Outline: HomeOutlineIcon, Solid: HomeSolidIcon },
  ...ROUTES.filter((route) => !route.isDraft),
];

const Navigation: React.FC = () => {
  const pathname = usePathname();

  return (
    <ul className="mx-auto my-8 flex max-w-7xl border-b">
      {routes.map(({ path, label, Outline, Solid }) => {
        const isCurrentPath = pathname === path;

        return (
          <li key={path}>
            <Link
              href={path}
              className="relative flex items-center gap-1 px-4 py-2"
            >
              {isCurrentPath ? (
                <Solid className="text-primary h-5 w-5" />
              ) : (
                <Outline className="h-5 w-5" />
              )}
              <span
                className={cn(
                  "text-xs font-semibold sm:text-base",
                  isCurrentPath && "text-primary font-bold",
                )}
              >
                {label}
              </span>
              {isCurrentPath && (
                <motion.div
                  className="bg-primary absolute -bottom-0.5 left-0 h-[3px] w-full"
                  layoutId="blog-nav-underline"
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default Navigation;
