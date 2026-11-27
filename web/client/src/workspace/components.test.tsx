import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentMeta, Folder } from '../api/types';
import { ExplorerView, type ExplorerViewProps } from './explorer/ExplorerPanel';
import { buildTree } from './lib/tree';
import { SearchResultsView } from './search/SearchResults';
import type { TreeActions } from './state/useTreeData';
import { DialogProvider } from './ui/Dialogs';
import { ToastProvider } from './ui/Toast';

const folders: Folder[] = [{ id: 'f1', parentId: null, name: 'Guides', createdAt: '2024-01-01' }];
const documents: DocumentMeta[] = [
  { id: 'd1', folderId: 'f1', name: 'setup.md', size: 10, createdAt: '2024-01-01', updatedAt: '2024-01-01', updatedByName: null },
  { id: 'd2', folderId: null, name: 'readme.md', size: 10, createdAt: '2024-01-01', updatedAt: '2024-01-01', updatedByName: null },
];

function makeActions(): TreeActions {
  return {
    createFolder: vi.fn().mockResolvedValue(null),
    createDocument: vi.fn().mockResolvedValue(null),
    rename: vi.fn().mockResolvedValue(true),
    move: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  };
}

function renderExplorer(over: Partial<ExplorerViewProps> = {}) {
  const props: ExplorerViewProps = {
    model: buildTree(folders, documents),
    status: 'ready',
    errorMessage: null,
    live: true,
    actions: makeActions(),
    userId: 'u-test',
    canEdit: true,
    currentDocId: null,
    onOpen: vi.fn(),
    onRefresh: vi.fn(),
    ...over,
  };
  render(
    <ToastProvider>
      <DialogProvider>
        <ExplorerView {...props} />
      </DialogProvider>
    </ToastProvider>,
  );
  return props;
}

describe('ExplorerView', () => {
  beforeEach(() => localStorage.clear());

  it('renders folders first and opens a document on click', async () => {
    const props = renderExplorer();
    const items = screen.getAllByRole('treeitem');
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['Guides', 'readme.md']);

    fireEvent.click(screen.getByRole('treeitem', { name: 'readme.md' }));
    expect(props.onOpen).toHaveBeenCalledWith('d2');
  });

  it('expands a folder to reveal its documents', async () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('treeitem', { name: 'Guides' }));
    expect(await screen.findByRole('treeitem', { name: 'setup.md' })).toBeInTheDocument();
  });

  it('renames inline with F2 + Enter', async () => {
    const props = renderExplorer();
    const row = screen.getByRole('treeitem', { name: 'readme.md' });
    fireEvent.focus(row);
    fireEvent.keyDown(row, { key: 'F2' });
    const input = await screen.findByRole('textbox', { name: /rename readme\.md/i });
    fireEvent.change(input, { target: { value: 'intro.md' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(props.actions.rename).toHaveBeenCalledWith('document', 'd2', 'intro.md'));
  });

  it('deletes through the context menu after confirmation', async () => {
    const props = renderExplorer();
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'readme.md' }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /delete/i }));
    const confirm = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(confirm);
    await waitFor(() => expect(props.actions.remove).toHaveBeenCalledWith('document', 'd2'));
  });

  it('offers rename and move in the context menu', async () => {
    renderExplorer();
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'readme.md' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /rename/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /move to/i })).toBeInTheDocument();
  });

  it('shows no write actions to viewers', async () => {
    renderExplorer({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'New document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveAttribute('draggable', 'false');

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'readme.md' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /rename/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /new document/i })).not.toBeInTheDocument();
  });
});

describe('SearchResultsView', () => {
  const base = { query: 'alpha', loading: false, error: null, activeIndex: 0, listId: 'sr' };

  it('highlights matches with <mark> and never injects HTML', () => {
    render(
      <SearchResultsView
        {...base}
        results={[{ documentId: 'd1', name: 'a.md', path: 'a.md', snippet: 'x <img src=x onerror=alert(1)> \uE000alpha\uE001 beta' }]}
        onOpen={() => undefined}
      />,
    );
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('alpha');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });

  it('opens the hit that was selected', () => {
    const onOpen = vi.fn();
    const hit = { documentId: 'd1', name: 'a.md', path: 'a.md', snippet: '\uE000alpha\uE001' };
    render(<SearchResultsView {...base} results={[hit]} onOpen={onOpen} />);
    fireEvent.mouseDown(screen.getByTestId('search-result'));
    expect(onOpen).toHaveBeenCalledWith(hit);
  });

  it('shows an empty message', () => {
    render(<SearchResultsView {...base} results={[]} onOpen={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent(/no results/i);
  });
});
