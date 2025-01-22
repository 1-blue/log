import Link from "next/link";

const anchorClassName =
  "hover:after:visible after:invisible lg:after:absolute after:top-0 lg:after:right-full after:ml-2 lg:after:mr-2 after:px-2 after:bg-custom-less after:text-main-400 dark:after:text-main-500 after:rounded-md after:content-['#']";

interface Props extends React.HTMLAttributes<HTMLHeadingElement> {}

const H1: React.FC<React.PropsWithChildren<Props>> = ({
  children,

  ...restProps
}) => (
  <h1 className="relative mb-5 mt-8 scroll-mt-20 text-4xl" {...restProps}>
    <Link
      href={"#" + (children as string).replaceAll(" ", "-").toLowerCase()}
      className={anchorClassName}
    >
      {children}
    </Link>
  </h1>
);

const H2: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  ...restProps
}) => (
  <h2 className="relative mb-4 mt-7 scroll-mt-20 text-3xl" {...restProps}>
    <Link
      href={"#" + (children as string).replaceAll(" ", "-").toLowerCase()}
      className={anchorClassName}
    >
      {children}
    </Link>
  </h2>
);

const H3: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  ...restProps
}) => (
  <h3 className="relative mb-3 mt-6 scroll-mt-20 text-2xl" {...restProps}>
    <Link
      href={"#" + (children as string).replaceAll(" ", "-").toLowerCase()}
      className={anchorClassName}
    >
      {children}
    </Link>
  </h3>
);

const H4: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  ...restProps
}) => (
  <h4 className="relative mb-2.5 mt-5 scroll-mt-20 text-xl" {...restProps}>
    <Link
      href={"#" + (children as string).replaceAll(" ", "-").toLowerCase()}
      className={anchorClassName}
    >
      {children}
    </Link>
  </h4>
);

const H5: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  ...restProps
}) => (
  <h5 className="relative mb-2 mt-4 scroll-mt-20 text-lg" {...restProps}>
    <Link
      href={"#" + (children as string).replaceAll(" ", "-").toLowerCase()}
      className={anchorClassName}
    >
      {children}
    </Link>
  </h5>
);

const H6: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  ...restProps
}) => (
  <h6 className="relative mb-2 mt-4 scroll-mt-20 text-base" {...restProps}>
    <Link
      href={"#" + (children as string).replaceAll(" ", "-").toLowerCase()}
      className={anchorClassName}
    >
      {children}
    </Link>
  </h6>
);

const Heading = {
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
};

export default Heading;
