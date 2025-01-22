import CodeBlockClipBoardButton from "#/components/mdx/CodeBlockClipBoardButton";

interface Props extends React.HTMLAttributes<HTMLPreElement> {}

const Pre: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  ...restProps
}) => {
  return (
    <pre {...restProps}>
      <div className="sticky left-0 top-0 flex items-center bg-[#2A4759] pl-4">
        <div className="mr-auto flex gap-2">
          <div className="h-4 w-4 rounded-full bg-red-400" />
          <div className="h-4 w-4 rounded-full bg-yellow-400" />
          <div className="mr-auto h-4 w-4 rounded-full bg-green-400" />
        </div>

        <CodeBlockClipBoardButton />
      </div>

      {children}
    </pre>
  );
};

export default Pre;
