"use client";

import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";

const ThemeToggleOption: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <label className="swap swap-rotate">
      <input
        type="checkbox"
        className="theme-controller"
        value={theme}
        onChange={() =>
          setTheme((prev) => (prev === "light" ? "dark" : "light"))
        }
      />
      <SunIcon className="swap-off h-7 w-7 fill-current" />
      <MoonIcon className="swap-on h-7 w-7 fill-current" />
    </label>
  );
};

export default ThemeToggleOption;
