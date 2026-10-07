import { useId, type SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 20, ...rest }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...rest,
});

export const MenuIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const SendIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
export const StopIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
);
export const CopyIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const ChevronIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);
export const PencilIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
export const RefreshIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />
  </svg>
);
export const BrainIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.2A3 3 0 0 0 4.6 9a3 3 0 0 0 .4 5.2A3 3 0 0 0 9 19.5 2.5 2.5 0 0 0 12 20V4.5A2.5 2.5 0 0 0 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.2A3 3 0 0 1 19.4 9a3 3 0 0 1-.4 5.2 3 3 0 0 1-4 5.3A2.5 2.5 0 0 1 12 20" />
  </svg>
);
export const ArrowDownIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
);
export const TerminalIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 17 6-6-6-6M12 19h8" />
  </svg>
);
export const CubeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
  </svg>
);
export const AlertIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const MicIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="2.5" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
  </svg>
);
export const ImageIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L5 21" />
  </svg>
);
export const CameraIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const PaperclipIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
  </svg>
);
export const WaveIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" />
  </svg>
);
export const PlayIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none" />
  </svg>
);
export const PauseIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="4" width="4" height="16" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" rx="1.2" fill="currentColor" stroke="none" />
  </svg>
);

/** The four-pointed "spark" logo, filled with the brand gradient. */
export function Spark({ size = 24, spinning = false }: { size?: number; spinning?: boolean }) {
  const id = `spark${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`spark${spinning ? ' spinning' : ''}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.5" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5C11.5 16.9 7.1 12.5 1.5 12 7.1 11.5 11.5 7.1 12 1.5Z"
      />
    </svg>
  );
}
