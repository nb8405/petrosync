import React from "react";

const styleValue = (value) => (typeof value === "number" ? `${value}px` : value);

export default function Skeleton({
  variant = "block",
  width,
  height,
  radius,
  count = 1,
}) {
  const style = {
    ...(width ? { width: styleValue(width) } : {}),
    ...(height ? { height: styleValue(height) } : {}),
    ...(radius ? { borderRadius: styleValue(radius) } : {}),
  };
  const items = Array.from({ length: Math.max(Number(count) || 1, 1) });

  return (
    <>
      {items.map((_, index) => (
        <span
          key={index}
          className={`ppm-skeleton ppm-skeleton-${variant}`}
          style={style}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
