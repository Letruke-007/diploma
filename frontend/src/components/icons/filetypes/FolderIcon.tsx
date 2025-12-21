import React from "react";

const FolderIcon: React.FC = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* Верхний язычок папки */}
    <path
      d="M4.5 8.3c0-1.2 1-2.1 2.1-2.1h3.2c.5 0 1 .2 1.4.6l1 1c.3.3.7.5 1.1.5h4.9c1.2 0 2.1 1 2.1 2.1v.4H4.5v-2.5z"
      fill="#1F2937"
    />

    {/* Основной корпус */}
    <rect
      x="4.5"
      y="8.7"
      width="15"
      height="11.3"
      rx="3"
      fill="#374151"
    />

    {/* Линия крышки */}
    <path
      d="M6.7 10.1h10.6"
      stroke="#6B7280"
      strokeWidth="1.1"
      strokeLinecap="round"
      opacity="0.9"
    />
  </svg>
);

export default FolderIcon;
