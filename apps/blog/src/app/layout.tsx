import { Metadata } from "next";

import { Toaster } from "@workspace/ui/components/Sonner";

import "#/css/globals.css";

import ThemeProvider from "#/components/providers/ThemeProvider";
import { getSharedMetadata } from "#/libs";
import ScrollProgressbar from "#/components/layout/ScrollProgressbar";
import FAB from "#/components/layout/FAB/FAB";

export const metadata: Metadata = getSharedMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="naver-site-verification" content="18eec7cb8e8639f6222fa09f13d8d25e39c7897e" />
      </head>

      <body className="scroll-smooth p-4">
        <ScrollProgressbar />

        <Toaster position="top-center" richColors />

        <ThemeProvider>
          <FAB />

          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
