import type { IPostWithETC } from "#/types";

import PostCard from "#/app/_components/molecules/PostCard";

interface Props {
  posts: IPostWithETC[];
}

const GridView: React.FC<Props> = ({ posts }) => {
  return (
    <ul className="grid grid-cols-3 gap-4">
      {posts.map((post) => (
        <PostCard key={post.path} post={post} />
      ))}
    </ul>
  );
};

export default GridView;
