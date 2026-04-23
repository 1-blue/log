"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { Button } from "@workspace/ui/components/Button";
import {
  AnimatePresence,
  motion,
  type Transition,
  type Variants,
} from "motion/react";
import { useTheme } from "next-themes";
import { useRef } from "react";

const moonVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.8, opacity: 0 },
};

const sunVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.8, opacity: 0 },
};

const transition: Transition = {
  duration: 0.15,
  type: "tween",
};

const ThemeToggleOption: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const checkboxInputRef = useRef<HTMLInputElement>(null);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="cursor-pointer"
      onClick={() => checkboxInputRef.current?.click()}
    >
      <input
        hidden
        type="checkbox"
        className="theme-controller"
        value={theme}
        ref={checkboxInputRef}
        onChange={() =>
          setTheme((prev) => (prev === "light" ? "dark" : "light"))
        }
      />
      <AnimatePresence mode="wait" initial={false}>
        {theme === "light" ? (
          <motion.div
            key="moon"
            variants={moonVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            <MoonIcon className="h-6 w-6 fill-current" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            variants={sunVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            <SunIcon className="h-6 w-6 fill-current" />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
};

export default ThemeToggleOption;
