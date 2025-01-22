"use client";

import { useState, useRef, useEffect } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { cn } from "@repo/ui/utils";
import { useRouter } from "next/navigation";

interface Props {
  tags: Record<string, number>;
}

const SearchInputByTag: React.FC<Props> = ({ tags }) => {
  const router = useRouter();
  const [searchTag, setSearchTag] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const suggestionRef = useRef<HTMLUListElement>(null);
  const tagNames = Object.keys(tags);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    setSearchTag(value);

    if (value.length > 0) {
      const filteredSuggestions = tagNames.filter((tag) =>
        tag.toLowerCase().includes(value.toLowerCase()),
      );
      setSuggestions(filteredSuggestions);
    } else {
      setSuggestions([]);
    }
  };

  const handleSearch = () => {
    if (!searchTag.trim()) return;

    router.replace(`/tags?tag=${encodeURIComponent(searchTag.trim())}`);
  };

  /** 방향키로 추천 검색어 이동 및 엔터 검색 */
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        if (selectedIndex < 0) return handleSearch();

        setSearchTag(suggestions[selectedIndex]);
        setSuggestions([]);
        router.replace(
          `/tags?tag=${encodeURIComponent(suggestions[selectedIndex].trim())}`,
        );
        break;
    }
  };

  // 추천 검색어 개수 변경 시 AutoComplete 높이에 반영
  useEffect(() => {
    if (!suggestionRef.current) return;

    if (isFocused && suggestions.length > 0) {
      setIsVisible(true);
      suggestionRef.current.style.maxHeight = `${suggestionRef.current.scrollHeight}px`;
    } else {
      setIsVisible(false);
      suggestionRef.current.style.maxHeight = "0px";
    }
  }, [isFocused, suggestions]);

  return (
    <div className="relative">
      <label className="input input-bordered mr-auto flex w-80 items-center gap-2">
        <input
          type="search"
          className="grow"
          placeholder="ex) Next.js 14"
          value={searchTag}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onKeyDown={handleKeyDown}
        />
        <MagnifyingGlassIcon
          className="h-6 w-6 cursor-pointer opacity-70"
          role="button"
          onClick={handleSearch}
        />
      </label>

      <ul
        ref={suggestionRef}
        className={cn(
          "absolute left-0 z-10 mt-2 w-80 overflow-hidden rounded-lg bg-white p-1.5 shadow-[4px_4px_50px_0px_rgba(0,0,0,0.3)] transition-all duration-300 ease-in-out dark:bg-slate-700",
          isVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={index}
            className={`cursor-pointer rounded-xl px-4 py-2 transition-colors hover:bg-slate-200 dark:hover:bg-slate-600 dark:hover:text-white ${
              index === selectedIndex
                ? "bg-slate-200 dark:bg-slate-600 dark:text-white"
                : ""
            }`}
            onClick={() => {
              setSearchTag(suggestion);
              setSuggestions([]);
              router.replace(
                `/tags?tag=${encodeURIComponent(suggestion.trim())}`,
              );
            }}
          >
            {suggestion}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchInputByTag;
