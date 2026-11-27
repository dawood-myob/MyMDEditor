import { Modal } from '../ui/Modal';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Workspace',
    rows: [
      [`${MOD}+K`, 'Search documents (inside the editor: insert link)'],
      ['/', 'Focus search'],
      ['Esc', 'Restore a maximised panel / leave Focus mode'],
      ['Double-click tab', 'Maximise or restore a panel'],
      ['F6 / Shift+F6', 'Move between panel groups'],
      [`${MOD}+] / ${MOD}+[`, 'Next / previous tab in a group'],
    ],
  },
  {
    title: 'Editor',
    rows: [
      [`${MOD}+B / ${MOD}+I`, 'Bold / italic'],
      [`${MOD}+Shift+X / ${MOD}+E`, 'Strikethrough / inline code'],
      [`${MOD}+K`, 'Insert link'],
      [`${MOD}+Alt+1…3`, 'Heading 1–3'],
      ['Tab / Shift+Tab', 'Indent / outdent'],
      ['Enter', 'Continue lists and quotes'],
      [`${MOD}+Z / ${MOD}+Y`, 'Undo / redo (your changes only)'],
      [`${MOD}+F / ${MOD}+H`, 'Find / replace'],
    ],
  },
  {
    title: 'Explorer',
    rows: [
      ['↑ ↓ ← →', 'Navigate, expand and collapse'],
      ['Enter', 'Open the document / toggle the folder'],
      ['F2', 'Rename'],
      ['Delete', 'Delete'],
      ['Shift+F10', 'Context menu'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="ws-shortcuts" data-testid="shortcuts">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.rows.map(([keys, what]) => (
                <div key={keys + what} className="ws-shortcut-row">
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
