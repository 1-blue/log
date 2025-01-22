import type { IPostWithETC } from "#/types";

import PostList from "#/app/_components/molecules/PostList";

interface Props {
  posts: Omit<IPostWithETC, "content">[];
}

const ListView: React.FC<Props> = ({ posts }) => {
  return (
    <ul className="flex flex-col">
      {posts.map((post, index, array) => (
        <div key={post.path}>
          <PostList post={post} />
          {index !== array.length - 1 && (
            <hr className="my-4 border-gray-300 dark:border-gray-700" />
          )}
        </div>
      ))}
    </ul>
  );
};

export default ListView;
