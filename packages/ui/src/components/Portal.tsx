"use client";

import { useEffect, useState } from "react";
import ReactDOM from "react-dom";

interface Props {
  rootName: string;
}

const Portal: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  rootName,
}) => {
  const [hasRootElement, setHasRootElement] = useState(false);

  useEffect(() => {
    const $rootAlert = document.getElementById(rootName);
    if (!$rootAlert) return;

    setHasRootElement(true);
  }, [rootName]);

  if (typeof window === "undefined") return <></>;
  if (!hasRootElement) return <></>;

  return ReactDOM.createPortal(children, document.getElementById(rootName)!);
};

export default Portal;
