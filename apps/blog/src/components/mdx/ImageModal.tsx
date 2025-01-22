"use client";

import { useEffect } from "react";
import Image, { type ImageProps } from "next/image";
import { motion } from "motion/react";

interface Props extends Pick<ImageProps, "src" | "alt"> {
  layoutId: string;
  closeModal: () => void;
}

const ImageModal: React.FC<Props> = ({
  layoutId,
  closeModal,
  ...restProps
}) => {
  useEffect(() => {
    const preventScroll = (e: WheelEvent) => e.preventDefault();

    window.addEventListener("wheel", preventScroll, { passive: false });
    return () => window.removeEventListener("wheel", preventScroll);
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60"
      />

      <div
        className="fixed inset-0 z-[101] flex cursor-pointer items-center justify-center"
        onClick={closeModal}
      >
        <motion.figure
          layoutId={layoutId}
          className="relative aspect-video w-[90%] object-contain"
        >
          <Image {...restProps} />
        </motion.figure>
      </div>
    </>
  );
};

export default ImageModal;
