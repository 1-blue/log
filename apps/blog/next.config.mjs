import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import rehypePrism from "rehype-prism-plus";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      /** 코드 블럭 */
      rehypePrism,
    ],
  },
});

export default withMDX(nextConfig);
