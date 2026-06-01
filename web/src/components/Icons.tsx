// Outline icons at 14-16px. Ported from prototype.
import React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

const Icon: React.FC<React.PropsWithChildren<IconProps>> = ({
  children,
  size = 14,
  strokeWidth = 1.6,
  ...rest
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
    {...rest}
  >
    {children}
  </svg>
);

export const Icons = {
  Layout: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="16" width="7" height="5" rx="1" />
    </Icon>
  ),
  Cabinet: (p: IconProps) => (
    <Icon {...p}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
    </Icon>
  ),
  Library: (p: IconProps) => (
    <Icon {...p}>
      <line x1="4" y1="4" x2="4" y2="20" />
      <rect x="6" y="4" width="3" height="16" />
      <rect x="10" y="6" width="3" height="14" />
      <rect x="14" y="4" width="3" height="16" />
      <line x1="19" y1="4" x2="19" y2="20" />
    </Icon>
  ),
  Settings: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
  Play: (p: IconProps) => (
    <Icon {...p}>
      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
    </Icon>
  ),
  Refresh: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Icon>
  ),
  Lock: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  ),
  Unlock: (p: IconProps) => (
    <Icon {...p}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </Icon>
  ),
  LockSmall: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 16 16" width={9} height={9} fill="currentColor" {...p}>
      <path d="M5 7V5a3 3 0 0 1 6 0v2h.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H5zm1 0h4V5a2 2 0 1 0-4 0v2z" />
    </svg>
  ),
  Trash: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  ),
  Warning: (p: IconProps) => (
    <Icon {...p}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  ),
  Search: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Icon>
  ),
  Plus: (p: IconProps) => (
    <Icon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  ),
  Drag: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor" {...p}>
      <circle cx="5" cy="3" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="5" cy="13" r="1.2" />
      <circle cx="11" cy="3" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="11" cy="13" r="1.2" />
    </svg>
  ),
  Tray: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  ),
  External: (p: IconProps) => (
    <Icon {...p}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Icon>
  ),
  Save: (p: IconProps) => (
    <Icon {...p}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </Icon>
  ),
  ChevronDown: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  ),
  Check: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  ),
  X: (p: IconProps) => (
    <Icon {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  ),
  Rotate: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </Icon>
  ),
  ZoomIn: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Icon>
  ),
  ZoomOut: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Icon>
  ),
  Maximize: (p: IconProps) => (
    <Icon {...p}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </Icon>
  ),
  Folder: (p: IconProps) => (
    <Icon {...p}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </Icon>
  ),
  Info: (p: IconProps) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </Icon>
  ),
  Sliders: (p: IconProps) => (
    <Icon {...p}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </Icon>
  ),
};
