import Link from "next/link";

const anchorClassName =
  "hover:after:visible after:invisible lg:after:absolute after:top-0 lg:after:right-full after:ml-2 lg:after:mr-2 after:px-2 after:bg-accent after:text-primary after:rounded-md after:content-['#']";

interface Props extends React.HTMLAttributes<HTMLHeadingElement> {}

const H1: React.FC<React.PropsWithChildren<Props>> = ({
  children,

  ...restProps
}) => (
  <h1
    className="relative mt-8 mb-5 scroll-mt-20 text-4xl font-semibold"
    {...restProps}
  >
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
  <h2
    className="relative mt-7 mb-4 scroll-mt-20 text-3xl font-semibold"
    {...restProps}
  >
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
  <h3
    className="relative mt-6 mb-3 scroll-mt-20 text-2xl font-semibold"
    {...restProps}
  >
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
  <h4
    className="relative mt-5 mb-2.5 scroll-mt-20 text-xl font-semibold"
    {...restProps}
  >
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
  <h5
    className="relative mt-4 mb-2 scroll-mt-20 text-lg font-semibold"
    {...restProps}
  >
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
  <h6
    className="relative mt-4 mb-2 scroll-mt-20 text-base font-semibold"
    {...restProps}
  >
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
