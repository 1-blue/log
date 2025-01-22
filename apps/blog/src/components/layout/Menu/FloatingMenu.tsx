import { Bars3Icon } from "@heroicons/react/24/outline";

import { getAllPosts } from "#/libs/post";
import ThemeToggleOption from "#/components/layout/Menu/ThemeToggleOption";
import KeyBarOption from "#/components/layout/Menu/KeyBarOption";

const postMetadatas = getAllPosts();

const FloatingMenu: React.FC = () => {
  return (
    <div className="dropdown dropdown-end dropdown-top fixed bottom-4 right-4 z-10">
      <div tabIndex={0} role="button" className="btn btn-square p-2">
        <Bars3Icon />
      </div>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-[1] mb-1 rounded-box bg-base-300 p-2 shadow"
      >
        <li>
          <KeyBarOption
            keyBarPosts={postMetadatas.map(({ title, path }) => ({
              title,
              path,
            }))}
          />
        </li>
        <li>
          <ThemeToggleOption />
        </li>
      </ul>
    </div>
  );
};

export default FloatingMenu;
