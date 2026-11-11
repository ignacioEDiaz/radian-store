import type { ReactNode } from 'react';

/** Íconos de línea del tema (mismo trazo y proporciones que el original). */
function Line({ size, box = 20, stroke = 1.5, round, children }: { size: number; box?: number; stroke?: number; round?: boolean; children: ReactNode }) {
  return (
    <svg
      className="icon-line"
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      {...(round ? { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const } : {})}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ChevronIcon = () => (
  <Line size={16} box={16} round>
    <path d="M4.5 6.5 8 10l3.5-3.5" />
  </Line>
);
export const CheckIcon = ({ size = 8 }: { size?: number }) => (
  <Line size={size}>
    <path d="M4 10l5 5 7-8" />
  </Line>
);
export const SortIcon = () => (
  <Line size={16}>
    <path d="M5 4v12M5 16l-2.5-2.5M5 16l2.5-2.5M15 16V4M15 4l-2.5 2.5M15 4l2.5 2.5" />
  </Line>
);
export const FilterIcon = () => (
  <Line size={18}>
    <path d="M3 5h14M6 10h8M8.5 15h3" />
  </Line>
);
export const BagIcon = () => (
  <Line size={18}>
    <path d="M5 7.5h10l.75 9H4.25l.75-9z" />
    <path d="M7.25 7.5V6a2.75 2.75 0 015.5 0v1.5" />
  </Line>
);
export const ArrowDownIcon = () => (
  <Line size={14}>
    <path d="M5 7.5l5 5 5-5" />
  </Line>
);
export const MinusIcon = () => (
  <Line size={16} box={16} stroke={1.8} round>
    <path d="M3.5 8h9" />
  </Line>
);
export const PlusIcon = () => (
  <Line size={16} box={16} stroke={1.8} round>
    <path d="M3.5 8h9M8 3.5v9" />
  </Line>
);
export const DisclosureIcon = () => (
  <Line size={16} box={16}>
    <path d="M3 8h10" />
    <path d="M8 3v10" />
  </Line>
);
export const TruckIcon = () => (
  <Line size={20}>
    <rect x="1" y="5" width="12" height="9" rx="1" />
    <path d="M13 8l3 1 2 3v3h-5V8z" />
    <circle cx="5" cy="16" r="1.5" />
    <circle cx="15" cy="16" r="1.5" />
  </Line>
);
