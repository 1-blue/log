"use client";

import { motion, useScroll, useSpring } from "motion/react";

import "#/css/scrollbar.css";

const ScrollProgressbar: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="fixed inset-0 z-[11] h-1.5 bg-gray-200 shadow-md dark:bg-gray-700">
      <motion.div
        className="h-full origin-left bg-gradient-to-r from-[#4FD1C5] to-[#9F7AEA]"
        style={{ scaleX }}
      />
    </div>
  );
};

export default ScrollProgressbar;
