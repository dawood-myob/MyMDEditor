import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function make(path: ReactNode) {
  return function Icon({ size = 16, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {path}
      </svg>
    );
  };
}

export const IconFolder = make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconFolderOpen = make(<path d="M3 8V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 8h18l-1.6 9a2 2 0 0 1-2 1.6H6.6a2 2 0 0 1-2-1.6z" />);
export const IconFile = make(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>);
export const IconFilePlus = make(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></>);
export const IconFolderPlus = make(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10v6M9 13h6" /></>);
export const IconChevronRight = make(<path d="m9 6 6 6-6 6" />);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IconChevronsUp = make(<path d="m7 11 5-5 5 5M7 18l5-5 5 5" />);
export const IconCollapseAll = make(<path d="m7 4 5 5 5-5M7 20l5-5 5 5" />);
export const IconRefresh = make(<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />);
export const IconMinimize = make(<path d="M5 19h14" />);
export const IconMaximize = make(<rect x="5" y="5" width="14" height="14" rx="1.5" />);
export const IconRestore = make(<><rect x="4" y="9" width="11" height="11" rx="1.5" /><path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5H18a1.5 1.5 0 0 1 1.5 1.5V14A1.5 1.5 0 0 1 18 15.5h-3" /></>);
export const IconClose = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconFloat = make(<><rect x="3" y="7" width="13" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" /></>);
export const IconDock = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 12h18M12 12v8" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconLayout = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M9 12h12" /></>);
export const IconImport = make(<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />);
export const IconExport = make(<path d="M12 15V3m0 0 4 4m-4-4L8 7M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />);
export const IconSun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = make(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />);
export const IconHelp = make(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></>);
export const IconBold = make(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z" />);
export const IconItalic = make(<path d="M10 5h8M6 19h8M14 5l-4 14" />);
export const IconStrike = make(<path d="M5 12h14M16 7.5C15.5 6 14 5 12 5c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 3M8 16.5C8.5 18 10 19 12 19c2.5 0 4-1.3 4-3 0-.6-.2-1.1-.5-1.5" />);
export const IconCode = make(<path d="m8 8-4 4 4 4M16 8l4 4-4 4" />);
export const IconLink = make(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />);
export const IconListBullet = make(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
export const IconListNumber = make(<path d="M10 6h10M10 12h10M10 18h10M4 5l1-1v4M4 13h2l-2 3h2M4 19h2v1H4m2 0v1H4" />);
export const IconTask = make(<><rect x="3.5" y="4" width="6" height="6" rx="1" /><path d="m5 7 1.2 1.2L8 6M13 7h8M13 17h8M3.5 14h6v6h-6z" /></>);
export const IconQuote = make(<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6" />);
export const IconCodeBlock = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m9.5 9.5-2.5 2.5 2.5 2.5M14.5 9.5l2.5 2.5-2.5 2.5" /></>);
export const IconTable = make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>);
export const IconRule = make(<path d="M4 12h16" />);
export const IconUndo = make(<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />);
export const IconRedo = make(<path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />);
export const IconWrap = make(<path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4m0 0 2-2m-2 2 2 2M4 18h5" />);
export const IconZoomIn = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></>);
export const IconZoomOut = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></>);
export const IconHistory = make(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /><path d="M12 7v5l3 2" /></>);
export const IconList = make(<path d="M4 6h16M4 12h10M4 18h14" />);
export const IconEye = make(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEdit = make(<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />);
export const IconTrash = make(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const IconMove = make(<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconCloudOff = make(<path d="M3 3l18 18M9 5.5A6 6 0 0 1 17.7 9.5 4.5 4.5 0 0 1 19 18H8M5.3 18A4.5 4.5 0 0 1 5.5 9" />);
export const IconSave = make(<><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconKeyboard = make(<><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>);
export const IconPalette = make(<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 3-3A9 9 0 0 0 12 3zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01" />);
