import { describe, expect, it } from 'vitest';
import type { DocumentMeta, Folder } from '../../api/types';
import { buildTree, flattenVisible, moveTargets, naturalCompare, validateMove } from './tree';
import { normalizeDocName, uniqueName, validateName } from './names';

const folder = (id: string, name: string, parentId: string | null = null): Folder =>
  ({ id, name, parentId, createdAt: '', updatedAt: '' }) as unknown as Folder;
const doc = (id: string, name: string, folderId: string | null = null): DocumentMeta =>
  ({ id, name, folderId, createdAt: '', updatedAt: '', size: 0 }) as unknown as DocumentMeta;

describe('tree', () => {
  const folders = [folder('f2', 'zeta'), folder('f1', 'Alpha'), folder('f3', 'inner', 'f1'), folder('f4', 'deep', 'f3')];
  const docs = [doc('d1', 'b.md'), doc('d2', 'a10.md', 'f1'), doc('d3', 'a2.md', 'f1'), doc('d4', 'root.md')];
  const model = buildTree(folders, docs);

  it('puts folders first and sorts naturally and case-insensitively', () => {
    expect(model.roots.map((n) => n.name)).toEqual(['Alpha', 'zeta', 'b.md', 'root.md']);
    const alpha = model.folders.get('f1')!;
    expect(alpha.children.map((n) => n.name)).toEqual(['inner', 'a2.md', 'a10.md']);
    expect(naturalCompare('file2', 'file10')).toBeLessThan(0);
  });

  it('computes paths', () => {
    expect(model.folders.get('f4')!.path).toBe('Alpha/inner/deep');
    expect(model.documents.get('d3')!.path).toBe('Alpha/a2.md');
  });

  it('shows orphans at the root instead of dropping them', () => {
    const m = buildTree([folder('x', 'orphan', 'missing')], [doc('y', 'lost.md', 'missing')]);
    expect(m.roots.map((n) => n.name)).toEqual(['orphan', 'lost.md']);
  });

  it('survives cyclic folder data', () => {
    const m = buildTree([folder('a', 'a', 'b'), folder('b', 'b', 'a')], []);
    expect(m.roots.length).toBeGreaterThan(0);
  });

  it('flattens only expanded folders', () => {
    expect(flattenVisible(model.roots, new Set()).map((r) => r.node.name)).toEqual(['Alpha', 'zeta', 'b.md', 'root.md']);
    const rows = flattenVisible(model.roots, new Set(['f1']));
    expect(rows.map((r) => [r.node.name, r.depth])).toContainEqual(['a2.md', 1]);
  });

  describe('validateMove', () => {
    it('rejects moving a folder into itself or a descendant', () => {
      expect(validateMove(model, { kind: 'folder', id: 'f1' }, 'f1')).toMatchObject({ ok: false, code: 'cycle' });
      expect(validateMove(model, { kind: 'folder', id: 'f1' }, 'f4')).toMatchObject({ ok: false, code: 'cycle' });
    });

    it('rejects no-op moves and missing items', () => {
      expect(validateMove(model, { kind: 'document', id: 'd1' }, null)).toMatchObject({ ok: false, code: 'same' });
      expect(validateMove(model, { kind: 'document', id: 'nope' }, null)).toMatchObject({ ok: false, code: 'missing' });
      expect(validateMove(model, { kind: 'document', id: 'd1' }, 'nope')).toMatchObject({ ok: false, code: 'missing' });
    });

    it('detects sibling name conflicts', () => {
      const m = buildTree([folder('f', 'f')], [doc('a', 'x.md'), doc('b', 'X.md', 'f')]);
      expect(validateMove(m, { kind: 'document', id: 'a' }, 'f')).toMatchObject({ ok: false, code: 'conflict' });
    });

    it('accepts valid moves', () => {
      expect(validateMove(model, { kind: 'document', id: 'd1' }, 'f1')).toEqual({ ok: true });
      expect(validateMove(model, { kind: 'folder', id: 'f4' }, null)).toEqual({ ok: true });
    });
  });

  it('moveTargets excludes the folder itself but keeps the root and its descendants out', () => {
    const t = moveTargets(model, { kind: 'folder', id: 'f3' });
    expect(t[0].id).toBeNull();
    expect(t.map((x) => x.id)).not.toContain('f3');
  });
});

describe('names', () => {
  it('normalises document names', () => {
    expect(normalizeDocName(' notes ')).toBe('notes.md');
    expect(normalizeDocName('a.MD')).toBe('a.MD');
  });

  it('validates names', () => {
    expect(validateName('ok', 'document')).toBeNull();
    expect(validateName('', 'folder')).not.toBeNull();
    expect(validateName('a/b', 'folder')).not.toBeNull();
    expect(validateName('con', 'document')).not.toBeNull();
    expect(validateName('x.', 'folder')).not.toBeNull();
    expect(validateName('..', 'folder')).not.toBeNull();
    expect(validateName('a'.repeat(130), 'folder')).not.toBeNull();
  });

  it('creates unique names case-insensitively', () => {
    expect(uniqueName('Untitled', ['untitled.md', 'Untitled 2.md'], '.md')).toBe('Untitled 3.md');
    expect(uniqueName('New folder', [])).toBe('New folder');
  });
});
