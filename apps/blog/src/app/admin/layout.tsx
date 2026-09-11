import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "취업 준비 관리",
  robots: {
    follow: false,
    index: false,
    nocache: true,
  },
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
