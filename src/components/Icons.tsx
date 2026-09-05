import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const PlayIcon = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.87l10.7-6.86a1 1 0 0 0 0-1.68L9.56 4.27C8.87 3.84 8 4.34 8 5.14z" />
  </svg>
);
export const PauseIcon = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const InfoIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);
export const StarIcon = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 2.5l2.9 6.26 6.85.72-5.1 4.6 1.44 6.72L12 17.3l-6.09 3.5 1.44-6.72-5.1-4.6 6.85-.72L12 2.5z" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const ChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const ChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const VolumeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
  </svg>
);
export const MuteIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="m23 9-6 6M17 9l6 6" />
  </svg>
);
export const FullscreenIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const BackIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
export const Forward10 = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
    <text x="8" y="15.5" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">
      10
    </text>
  </svg>
);
export const Rewind10 = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 3v6h6" />
    <text x="8" y="15.5" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">
      10
    </text>
  </svg>
);
export const FilmIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
  </svg>
);
export const TvIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M8 22h8M12 19v3" />
  </svg>
);
export const BookmarkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);
export const HomeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m3 11 9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
export const EyeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const ShareIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);
export const UsersIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
export const CalendarIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
export const GlobeIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
export const ClapperIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 11v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M2 11h20M6 11 4.5 6.5 19 3l1.5 4.5M9 10.5l-1.5-4.5M14 9.5l-1.5-4.5" />
  </svg>
);
export const ExpandIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
export const SparkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />
  </svg>
);
export const ChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const FlameIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 22c4.4 0 8-3.1 8-7.5 0-3-1.6-5-3-6.5-.5 1.5-1.5 2.5-2.5 3 0-3-1.5-6.5-4.5-8 .5 3-1 4.5-2.5 6.5C6 11.5 4 13 4 15.5 4 19.4 7.6 22 12 22z" />
  </svg>
);
export const SubtitleIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 14h4M13 14h5M6 10h8" />
  </svg>
);
export const DownloadIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
  </svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
  </svg>
);

/* ---- added: library / profile icons ---- */
export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
export const PinIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z" />
  </svg>
);
export const GridIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
export const ListIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
export const SettingsIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
export const HistoryIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
  </svg>
);
export const UserIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
export const EditIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
export const MoreIcon = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
  </svg>
);
export const SortIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16" />
  </svg>
);
export const FilterIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
);
export const CheckCircleIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" />
  </svg>
);
export const MailIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
  </svg>
);
export const ShieldIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
export const HelpIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </svg>
);
export const ChevronUp = (p: P) => (
  <svg {...base(p)}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);
export const SquareIcon = ({ checked, ...p }: P & { checked?: boolean }) => (
  <svg {...base(p)} fill={checked ? "currentColor" : "none"}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    {checked && <path d="m8 12 3 3 5-6" stroke="#000" strokeWidth={2.5} />}
  </svg>
);
export const NoteIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M8 13h8M8 17h5" />
  </svg>
);
export const LogoutIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const ShuffleIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);
export const SunIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
export const MoonIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
export const MonitorIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
export const LayersIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 2 10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
  </svg>
);
export const KeyboardIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6" />
  </svg>
);
export const ArrowLeftIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);
export const BellIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
export const RefreshIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
export const FolderIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
export const LockIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
export const MinimizeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);
export const MaximizeIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);
export const RestoreIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="14" height="14" rx="2" />
    <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
  </svg>
);
export const ExternalIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
  </svg>
);
export const SparklesIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8zM5 2l.6 1.6L7.2 4.2 5.6 4.8 5 6.4 4.4 4.8 2.8 4.2l1.6-.6z" />
  </svg>
);
