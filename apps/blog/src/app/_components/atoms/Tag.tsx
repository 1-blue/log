import Link, { type LinkProps } from "next/link";
import { TagIcon } from "@heroicons/react/24/solid";
import { cn } from "@workspace/ui/lib/utils";

interface Props extends Partial<LinkProps> {
  tag: string;
  className?: string;
}

const Tag: React.FC<Props> = ({ tag, href, className, ...props }) => {
  return (
    <li className="overflow-hidden rounded-sm transition-colors">
      <Link
        href={href ?? `/tags?tag=${tag}`}
        className={cn(
          "bg-accent text-primary inline-flex items-center gap-1.5 rounded-sm px-2 py-1 whitespace-nowrap",
          className,
        )}
        {...props}
      >
        <TagIcon className="h-3.5 w-3.5" />
        <span>{tag}</span>
      </Link>
    </li>
  );
};

export default Tag;
