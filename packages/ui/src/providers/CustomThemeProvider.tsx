"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";

/** @link https://velog.io/@dudwns/next-themes%EB%A1%9C-%EB%8B%A4%ED%81%AC-%EB%AA%A8%EB%93%9C-%EA%B5%AC%ED%98%84-%EC%8B%9C-Extra-attributes-from-the-server-class-style-%EC%97%90%EB%9F%AC */
const CustomThemeProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [isMount, setMount] = useState(false);

  useEffect(() => setMount(true), []);

  if (!isMount) return children;

  return <ThemeProvider defaultTheme="system">{children}</ThemeProvider>;
};

export { CustomThemeProvider };
