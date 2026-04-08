"use client";

import { useMemo } from 'react';
import { motion } from 'framer-motion';

const SPICED_COLORS = [
  '#861C1C', // Deep Red
  '#C06F30', // Terracotta
  '#F4B34F', // Golden Sand
  '#ECCEB6', // Light Peach
  '#2B1D1C', // Darkest Brown
];

export default function BallBackground() {
  const blobs = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const startX = Math.random() * 80 + 10;
        const startY = Math.random() * 80 + 10;
        const deltaX = Math.random() * 16 - 8;
        const deltaY = Math.random() * 16 - 8;
        const size = Math.random() * 220 + 240;
        const opacity = 0.14 + Math.random() * 0.12;
        const duration = 32 + Math.random() * 12;

        return {
          id: i,
          color: SPICED_COLORS[i % SPICED_COLORS.length],
          width: `${size}px`,
          height: `${size}px`,
          opacity,
          scale: 0.86 + Math.random() * 0.24,
          x: [`${startX}%`, `${startX + deltaX}%`, `${startX}%`],
          y: [`${startY}%`, `${startY + deltaY}%`, `${startY}%`],
          duration,
        };
      }),
    [],
  );

  return (
    <div className="fixed inset-0 -z-10 bg-[#E8E3CF] overflow-hidden pointer-events-none">
      {blobs.map((blob) => (
        <motion.div
          key={blob.id}
          initial={{ x: blob.x[0], y: blob.y[0], scale: blob.scale, opacity: blob.opacity }}
          animate={{
            x: blob.x,
            y: blob.y,
          }}
          transition={{
            duration: blob.duration,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
          className="absolute rounded-full blur-[96px] will-change-transform transform-gpu"
          style={{
            backgroundColor: blob.color,
            width: blob.width,
            height: blob.height,
          }}
        />
      ))}
    </div>
  );
}
