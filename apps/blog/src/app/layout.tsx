import type { Metadata } from "next";

import "@repo/tailwind-config/globals.css";
import { CustomThemeProvider, ToastProvider } from "@repo/ui/providers";

import "#/css/globals.css";
import { getSharedMetadata } from "#/libs/sharedMetadata";
import ScrollProgressbar from "#/components/layout/ScrollProgressbar";
import FloatingMenu from "#/components/layout/Menu/FloatingMenu";

export const metadata: Metadata = getSharedMetadata();

const RootLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <html lang="ko">
      <head></head>
      <body className="scroll-smooth p-4">
        <ScrollProgressbar />

        <CustomThemeProvider>
          <ToastProvider>
            <FloatingMenu />
            <main>{children}</main>
          </ToastProvider>
        </CustomThemeProvider>

        {/* 토스트 포탈 */}
        <aside
          id="toast-root"
          className="fixed left-1/2 top-0 z-[999] my-4 flex -translate-x-1/2 flex-col gap-4"
        />
      </body>
    </html>
  );
};

export default RootLayout;
