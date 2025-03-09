import { cn } from "@workspace/ui/lib/utils";

interface IProps extends React.PropsWithChildren {
  className?: string;
}

const CustomSection: React.FC<React.PropsWithChildren<IProps>> = ({
  children,
  className,
}) => {
  return (
    <section
      className={cn(
        "rounded-lg border border-gray-300 px-6 py-8 dark:border-gray-700",
        className,
      )}
    >
      {children}
    </section>
  );
};

export default CustomSection;
