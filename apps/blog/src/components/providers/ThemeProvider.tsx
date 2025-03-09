"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      {children}
    </NextThemesProvider>
  );
};

export default ThemeProvider;
