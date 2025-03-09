"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/Button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/Command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/Popover";

interface IProps {
  tags: string[];
  targetTag: string;
}

const TagCombobox: React.FC<IProps> = ({ tags, targetTag }) => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const existingTag = tags.find((tag) => tag === targetTag);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[240px] justify-between"
        >
          {existingTag ? targetTag : "필터링할 태그 선택"}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0">
        <Command>
          <CommandInput placeholder="Search framework..." className="h-9" />
          <CommandList>
            <CommandEmpty>태그가 없습니다.</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem
                  key={tag}
                  value={tag}
                  onSelect={(currentValue) => {
                    router.replace(`/tags?tag=${currentValue}`);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  {tag}
                  <Check
                    className={cn(
                      "ml-auto",
                      targetTag === tag ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TagCombobox;
