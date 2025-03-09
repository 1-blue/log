import Link from "next/link";
import { HouseIcon } from "lucide-react";

const HomeLinkButton = () => {
  return (
    <Link href="/">
      <HouseIcon
        role="button"
        className="h-8 w-8 cursor-pointer rounded-md border border-gray-500 p-1.5 transition-colors hover:border-gray-200 dark:hover:border-gray-100"
      />
    </Link>
  );
};

export default HomeLinkButton;
