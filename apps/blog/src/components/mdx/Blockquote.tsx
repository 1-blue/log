import {
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LightBulbIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/solid";

import { cn } from "@workspace/ui/lib/utils";

/**
 * + 인용 블록 타입
 */
type BlockquoteType = "info" | "tip" | "success" | "error" | "warning";

interface Props extends React.HTMLAttributes<HTMLElement> {
  type?: BlockquoteType;
}

const Blockquote: React.FC<React.PropsWithChildren<Props>> = ({
  type = "info",
  children,
  className,
  ...restProps
}) => {
  return (
    <blockquote
      {...restProps}
      className={cn(
        "group mb-5 flex flex-col rounded-md border-x-[6px] border-b-2",
        type === "info" && "border-orange-500",
        type === "tip" && "border-green-500",
        type === "success" && "border-blue-500",
        type === "error" && "border-red-500",
        type === "warning" && "border-yellow-500",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-2 font-bold",
          type === "info" && "bg-orange-200 text-orange-600",
          type === "tip" && "bg-green-200 text-green-600",
          type === "success" && "bg-blue-200 text-blue-600",
          type === "error" && "bg-red-200 text-red-600",
          type === "warning" && "bg-yellow-200 text-yellow-600",
        )}
      >
        {type === "info" && (
          <>
            <InformationCircleIcon className="h-7 w-7" />
            <span>정보</span>
          </>
        )}
        {type === "tip" && (
          <>
            <LightBulbIcon className="h-7 w-7" />
            <span>유용한 팁</span>
          </>
        )}
        {type === "success" && (
          <>
            <CheckBadgeIcon className="h-7 w-7" />
            <span>성공</span>
          </>
        )}
        {type === "error" && (
          <>
            <ExclamationTriangleIcon className="h-7 w-7" />
            <span>실패</span>
          </>
        )}
        {type === "warning" && (
          <>
            <ShieldExclamationIcon className="h-7 w-7" />
            <span>경고</span>
          </>
        )}
      </div>
      <p className="p-3">{children}</p>
    </blockquote>
  );
};

export default Blockquote;
