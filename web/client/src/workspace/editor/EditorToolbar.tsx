import type { ReactNode } from 'react';
import {
  IconBold,
  IconCode,
  IconCodeBlock,
  IconItalic,
  IconLink,
  IconListBullet,
  IconListNumber,
  IconQuote,
  IconRedo,
  IconRule,
  IconSearch,
  IconStrike,
  IconTable,
  IconTask,
  IconUndo,
  IconWrap,
  IconZoomIn,
  IconZoomOut,
} from '../ui/icons';

export type ToolbarAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'number'
  | 'task'
  | 'quote'
  | 'codeblock'
  | 'table'
  | 'rule'
  | 'undo'
  | 'redo'
  | 'find'
  | 'wrap'
  | 'zoomIn'
  | 'zoomOut';

interface Props {
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  wrap: boolean;
  onAction: (a: ToolbarAction) => void;
}

interface Btn { id: ToolbarAction; label: string; icon: ReactNode; shortcut?: string }

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

const GROUPS: Btn[][] = [
  [
    { id: 'undo', label: 'Undo', icon: <IconUndo />, shortcut: `${mod}Z` },
    { id: 'redo', label: 'Redo', icon: <IconRedo />, shortcut: `${mod}Y` },
  ],
  [
    { id: 'bold', label: 'Bold', icon: <IconBold />, shortcut: `${mod}B` },
    { id: 'italic', label: 'Italic', icon: <IconItalic />, shortcut: `${mod}I` },
    { id: 'strike', label: 'Strikethrough', icon: <IconStrike />, shortcut: `${mod}Shift+X` },
    { id: 'code', label: 'Inline code', icon: <IconCode />, shortcut: `${mod}E` },
    { id: 'link', label: 'Link', icon: <IconLink />, shortcut: `${mod}K` },
  ],
  [
    { id: 'h1', label: 'Heading 1', icon: <span className="ws-tb-text">H1</span> },
    { id: 'h2', label: 'Heading 2', icon: <span className="ws-tb-text">H2</span> },
    { id: 'h3', label: 'Heading 3', icon: <span className="ws-tb-text">H3</span> },
  ],
  [
    { id: 'bullet', label: 'Bulleted list', icon: <IconListBullet /> },
    { id: 'number', label: 'Numbered list', icon: <IconListNumber /> },
    { id: 'task', label: 'Task list', icon: <IconTask /> },
    { id: 'quote', label: 'Quote', icon: <IconQuote /> },
    { id: 'codeblock', label: 'Code block', icon: <IconCodeBlock /> },
    { id: 'table', label: 'Table', icon: <IconTable /> },
    { id: 'rule', label: 'Horizontal rule', icon: <IconRule /> },
  ],
];

const VIEW_BUTTONS: Btn[] = [
  { id: 'find', label: 'Find and replace', icon: <IconSearch />, shortcut: `${mod}F` },
  { id: 'wrap', label: 'Toggle line wrapping', icon: <IconWrap /> },
  { id: 'zoomOut', label: 'Zoom out', icon: <IconZoomOut /> },
  { id: 'zoomIn', label: 'Zoom in', icon: <IconZoomIn /> },
];

export function EditorToolbar({ disabled, canUndo, canRedo, wrap, onAction }: Props) {
  const render = (b: Btn, isView = false) => {
    const off = !isView && (disabled || (b.id === 'undo' && !canUndo) || (b.id === 'redo' && !canRedo));
    return (
      <button
        key={b.id}
        type="button"
        className={`ws-iconbtn${b.id === 'wrap' && wrap ? ' is-on' : ''}`}
        aria-label={b.label}
        aria-pressed={b.id === 'wrap' ? wrap : undefined}
        title={b.shortcut ? `${b.label} (${b.shortcut})` : b.label}
        disabled={off}
        data-action={b.id}
        // keep the editor selection/focus when pressing toolbar buttons
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAction(b.id)}
      >
        {b.icon}
      </button>
    );
  };

  return (
    <div className="ws-fmt" role="toolbar" aria-label="Formatting" aria-orientation="horizontal">
      {GROUPS.map((g, i) => (
        <div key={i} className="ws-tb-group" role="group">
          {g.map((b) => render(b))}
        </div>
      ))}
      <div className="ws-tb-group" role="group">
        {VIEW_BUTTONS.map((b) => render(b, true))}
      </div>
    </div>
  );
}
