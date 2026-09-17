"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function Tabs({
  children,
  className,
  onValueChange,
  value,
  ...props
}: React.ComponentProps<"div"> & {
  onValueChange?: (value: string) => void;
  value: string;
}) {
  return (
    <TabsContext.Provider
      value={{ value, onValueChange: onValueChange ?? (() => undefined) }}
    >
      <div className={cn("grid gap-5", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-orientation="horizontal"
      className={cn(
        "border-border bg-muted/30 inline-flex w-full gap-1 overflow-x-auto rounded-lg border p-1",
        className,
      )}
      role="tablist"
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used inside Tabs");

  return (
    <button
      aria-selected={context.value === value}
      aria-controls={`tabs-panel-${value}`}
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 data-[state=active]:bg-background data-[state=active]:text-foreground min-w-max flex-1 rounded-md px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] data-[state=active]:shadow-sm",
        className,
      )}
      data-state={context.value === value ? "active" : "inactive"}
      onClick={() => context.onValueChange(value)}
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget
            .closest('[role="tablist"]')
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
        );
        const index = tabs.indexOf(event.currentTarget);
        if (index < 0) return;
        const nextIndex =
          event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index - 1 + tabs.length) % tabs.length
              : -1;
        if (nextIndex >= 0) {
          event.preventDefault();
          tabs[nextIndex]?.focus();
          context.onValueChange(tabs[nextIndex]?.dataset.value ?? value);
        }
      }}
      role="tab"
      id={`tabs-trigger-${value}`}
      tabIndex={context.value === value ? 0 : -1}
      type="button"
      data-value={value}
      {...props}
    />
  );
}

function TabsContent({
  children,
  className,
  value,
  ...props
}: React.ComponentProps<"section"> & { value: string }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used inside Tabs");
  if (context.value !== value) return null;

  return (
    <section
      aria-label={`${value} 탭 내용`}
      aria-labelledby={`tabs-trigger-${value}`}
      className={cn("min-w-0", className)}
      id={`tabs-panel-${value}`}
      role="tabpanel"
      tabIndex={0}
      {...props}
    >
      {children}
    </section>
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
