import React from "react";

export default function TankIcon({ className = "tank-icon" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 64"
      role="img"
      aria-label="Fuel tank"
      focusable="false"
    >
      <path
        d="M16 24c0-7.73 6.27-14 14-14h28c7.73 0 14 6.27 14 14v2h4c4.42 0 8 3.58 8 8v8c0 4.42-3.58 8-8 8h-4v2c0 1.1-.9 2-2 2h-8c-1.1 0-2-.9-2-2v-2H28v2c0 1.1-.9 2-2 2h-8c-1.1 0-2-.9-2-2v-2h-2c-4.42 0-8-3.58-8-8v-8c0-4.42 3.58-8 8-8h2v-2Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M16 26c0-8.84 7.16-16 16-16h24c8.84 0 16 7.16 16 16v22H16V26Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M72 28h6c3.31 0 6 2.69 6 6v6c0 3.31-2.69 6-6 6h-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M26 48v6M62 48v6M30 22h28M26 34h36"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
