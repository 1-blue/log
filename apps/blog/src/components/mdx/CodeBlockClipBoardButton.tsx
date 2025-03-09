"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@workspace/ui/components/Button";

const CodeBlockClipBoardButton = () => {
  const buttonRef = useRef<null | HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  /**
   * 클립보드 핸들러
   * `DOM`에 직접 접근하는 방법은 안좋지만 `<Pre />를 서버 컴포넌트로 만들기 위해서 사용
   */
  const onClipboard = () => {
    if (!buttonRef.current) return;
    const $pre = buttonRef.current.parentElement?.nextElementSibling;

    if (!$pre) return;

    try {
      navigator.clipboard.writeText($pre.textContent as string);

      setCopied(true);
      setTimeout(() => setCopied(false), 1000);

      toast.success("코드를 복사했습니다.");
    } catch (error) {
      toast.error("코드를 복사에 실패했습니다.");
      console.error("🚫 Error onClipboard error >> ", error);
    }
  };

  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="icon"
      className="relative top-2 right-2 h-10 min-h-10 w-10 cursor-pointer border-none bg-gray-500 text-gray-100 opacity-50 hover:bg-gray-600"
    >
      {copied ? (
        <ClipboardDocumentCheckIcon className="h-6 w-6 text-green-400" />
      ) : (
        <ClipboardDocumentIcon className="h-6 w-6" onClick={onClipboard} />
      )}
    </Button>
  );
};

export default CodeBlockClipBoardButton;
