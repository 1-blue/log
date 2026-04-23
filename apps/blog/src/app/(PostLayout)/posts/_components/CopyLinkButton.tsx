"use client";

import { LinkIcon } from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

const CopyLinkButton = () => {
  const pathname = usePathname();
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        window.document.location.origin + pathname,
      );
      toast.success("게시글 링크를 복사했습니다.");
    } catch (error) {
      toast.error("게시글 링크를 복사에 실패했습니다.");
      console.error("🚫 Error CopyLinkButton >> ", error);
    }
  };

  return (
    <LinkIcon
      role="button"
      className="h-8 w-8 cursor-pointer rounded-md border border-gray-500 p-1.5 transition-colors hover:border-gray-200 dark:hover:border-gray-100"
      onClick={copyLink}
    />
  );
};

export default CopyLinkButton;
