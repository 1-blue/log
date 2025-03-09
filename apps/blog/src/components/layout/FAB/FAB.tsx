import { Bars3Icon } from "@heroicons/react/24/outline";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/Popover";
import { Button } from "@workspace/ui/components/Button";

import { getAllPosts } from "#/libs/post";
import ThemeToggleOption from "#/components/layout/FAB/ThemeToggleOption";
import KeyBarOption from "#/components/layout/FAB/KeyBarOption";

const allPosts = getAllPosts();

const FAB: React.FC = () => {
  return (
    <Popover>
      <PopoverTrigger asChild className="fixed right-6 bottom-6 z-50">
        <Button
          variant="outline"
          size="icon"
          className="bg-primary-foreground aspect-square cursor-pointer p-3"
        >
          <Bars3Icon className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-primary-foreground flex w-20 flex-col p-1.5"
        side="top"
        align="end"
      >
        <KeyBarOption
          keyBarPosts={allPosts.map(({ title, path }) => ({
            title,
            path,
          }))}
        />
        <ThemeToggleOption />
      </PopoverContent>
    </Popover>
  );
};

export default FAB;
