"use client";

import { ArrowUturnDownIcon } from "@heroicons/react/24/outline";

const ScrollBottomButton = () => {
  return (
    <ArrowUturnDownIcon
      role="button"
      className="h-8 w-8 rounded-md border border-gray-500 p-1.5 transition-colors hover:border-gray-200 dark:hover:border-gray-100"
      onClick={() =>
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
      }
    />
  );
};

export default ScrollBottomButton;
