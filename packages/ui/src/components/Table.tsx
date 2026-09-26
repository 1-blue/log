import type { ComponentProps } from "react";

import { cn } from "@workspace/ui/lib/utils";

function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div
      role="region"
      aria-label={props["aria-label"] ?? "가로로 스크롤할 수 있는 표"}
      tabIndex={0}
      className="border-border focus-visible:ring-ring relative w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <table
        {...props}
        className={cn("w-full border-collapse text-sm leading-6", className)}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      {...props}
      className={cn("bg-muted text-foreground [&_tr]:border-b", className)}
    />
  );
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      {...props}
      className={cn(
        "[&_tr:nth-child(even)]:bg-muted/30 [&_tr:last-child]:border-0",
        className,
      )}
    />
  );
}

function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      {...props}
      className={cn(
        "bg-muted/50 border-t font-medium [&_tr:last-child]:border-0",
        className,
      )}
    />
  );
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr {...props} className={cn("border-border border-b", className)} />;
}

function TableHead({
  className,
  scope = "col",
  ...props
}: ComponentProps<"th">) {
  return (
    <th
      {...props}
      scope={scope}
      className={cn("px-4 py-3 text-left align-top font-semibold", className)}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      {...props}
      className={cn("px-4 py-3 align-top [overflow-wrap:anywhere]", className)}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      {...props}
      className={cn(
        "text-muted-foreground caption-bottom px-4 py-3 text-left",
        className,
      )}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
