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
      <motion.figure
        layoutId={layoutId}
        onClick={openModal}
        className="relative z-[5] my-2 aspect-video cursor-pointer rounded-md object-contain"
      >
        <NextImage {...restProps} />
      </motion.figure>

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
