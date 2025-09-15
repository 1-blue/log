"use client";

import { useCallback, useState } from "react";
import NextImage, { ImageProps } from "next/image";
import { motion, AnimatePresence } from "motion/react";

import ImageModal from "#/components/mdx/ImageModal";

interface Props extends ImageProps {
  layoutId: string;
}

const Image: React.FC<Props> = ({ layoutId, ...restProps }) => {
  const [isOpen, setIsOpen] = useState(false);
  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <div className="my-2 flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">[{restProps.alt}]</p>
        <motion.figure
          layoutId={layoutId}
          onClick={openModal}
          className="relative z-[5] aspect-video cursor-pointer rounded-md border-2 object-contain"
        >
          <NextImage {...restProps} />
        </motion.figure>
      </div>

      <AnimatePresence>
        {isOpen && (
          <ImageModal
            layoutId={layoutId}
            closeModal={closeModal}
            {...restProps}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Image;
