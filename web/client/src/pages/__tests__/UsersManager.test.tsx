import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../api/types';
import { apiError, installFetch, makeUser, type MockHandler } from '../../app/test-utils';
import { ToastProvider } from '../../app/ui/Toast';
import { UsersManager } from '../UsersManager';

const COMPANY = 'company-1';
const admin = makeUser('admin', { id: 'u-admin', username: 'acme-admin', displayName: 'Ada Admin' });
const editor = makeUser('editor', { id: 'u-editor', username: 'editor', displayName: 'Eddie Editor', mustChangePassword: true });
const viewer = makeUser('viewer', { id: 'u-viewer', username: 'viewer', displayName: 'Vera Viewer', disabled: true });

function setup(extra: Record<string, MockHandler> = {}, props: { canManage?: boolean } = {}) {
  const mock = installFetch({
    [`GET /api/companies/${COMPANY}/users`]: { body: { users: [admin, editor, viewer] } },
    ...extra,
  });
  render(
    <ToastProvider>
      <UsersManager companyId={COMPANY} canManage={props.canManage ?? true} currentUserId="u-admin" />
    </ToastProvider>,
  );
  return mock;
}

const row = (username: string) => within(screen.getByTestId(`user-row-${username}`));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UsersManager', () => {
  it('renders users with name, username, role, status and initials', async () => {
    setup();
    expect(await screen.findByTestId('user-row-editor')).toBeInTheDocument();

    expect(row('acme-admin').getByText('Ada Admin', { selector: '.app-person__name' })).toBeInTheDocument();
    expect(row('acme-admin').getByText('@acme-admin')).toBeInTheDocument();
    expect(row('acme-admin').getByText('AA')).toBeInTheDocument();
    expect(row('acme-admin').getByText('You')).toBeInTheDocument();
    expect(row('acme-admin').getByText('Admin')).toBeInTheDocument();
    expect(row('editor').getByLabelText('Role for Eddie Editor')).toHaveValue('editor');
    expect(row('editor').getByText('Password pending')).toBeInTheDocument();
    expect(row('viewer').getByText('Disabled')).toBeInTheDocument();
    expect(row('viewer').getByRole('button', { name: /^Enable/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Users/ })).toHaveTextContent('3');
  });

  it('documents the roles in a legend', async () => {
    setup();
    await screen.findByTestId('user-row-editor');
    expect(screen.getByText('Roles & permissions')).toBeInTheDocument();
    expect(screen.getByText(/Read-only: browse, search/)).toBeInTheDocument();
  });

  it('filters users', async () => {
    setup();
    await screen.findByTestId('user-row-editor');
    fireEvent.change(screen.getByLabelText('Filter users'), { target: { value: 'vera' } });
    expect(screen.queryByTestId('user-row-editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-row-viewer')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter users'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching users')).toBeInTheDocument();
  });

  it('is read-only without canManage', async () => {
    setup({}, { canManage: false });
    await screen.findByTestId('user-row-editor');
    expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Eddie Editor')).not.toBeInTheDocument();
  });

  it("does not allow acting on the signed-in user's own account", async () => {
    setup();
    await screen.findByTestId('user-row-editor');
    expect(row('acme-admin').getByRole('button', { name: /Delete/ })).toBeDisabled();
    expect(row('acme-admin').getByRole('button', { name: /Disable/ })).toBeDisabled();
    expect(row('acme-admin').queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows an error banner with retry when loading fails', async () => {
    let attempts = 0;
    setup({
      [`GET /api/companies/${COMPANY}/users`]: () => (++attempts === 1 ? apiError(500, 'internal', 'boom') : { body: { users: [admin] } }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('user-row-acme-admin')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('add user', () => {
    const open = async () => {
      await screen.findByTestId('user-row-editor');
      fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
      return screen.findByRole('dialog', { name: 'Add user' });
    };

    it('posts the right payload with the CSRF header and shows the new user', async () => {
      const created = makeUser('viewer', { id: 'u-new', username: 'new.person', displayName: 'New Person' });
      const { calls } = setup({ [`POST /api/companies/${COMPANY}/users`]: { status: 201, body: { user: created } } });
      const dialog = await open();
      const d = within(dialog);

      fireEvent.change(d.getByLabelText('Username'), { target: { value: '  new.person ' } });
      fireEvent.change(d.getByLabelText('Display name'), { target: { value: 'New Person' } });
      fireEvent.change(d.getByLabelText('Role'), { target: { value: 'viewer' } });
      expect(d.getByText(/Read-only: browse/)).toBeInTheDocument();
      fireEvent.change(d.getByLabelText('Initial password'), { target: { value: 'Initial-Pass-99' } });
      fireEvent.click(d.getByRole('button', { name: 'Add user' }));

      expect(await screen.findByTestId('user-row-new.person')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const post = calls.find((c) => c.method === 'POST')!;
      expect(post.url).toBe(`/api/companies/${COMPANY}/users`);
      expect(post.headers['X-Requested-With']).toBe('mdhub');
      expect(post.headers['Content-Type']).toBe('application/json');
      expect(post.body).toEqual({ username: 'new.person', displayName: 'New Person', password: 'Initial-Pass-99', role: 'viewer' });
      expect(screen.getByText('New Person was added.')).toBeInTheDocument();
    });

    it('omits an empty display name and defaults to the editor role', async () => {
      const { calls } = setup({ [`POST /api/companies/${COMPANY}/users`]: { status: 201, body: { user: makeUser('editor', { id: 'u2', username: 'bob' }) } } });
      const d = within(await open());
      fireEvent.change(d.getByLabelText('Username'), { target: { value: 'bob' } });
      fireEvent.change(d.getByLabelText('Initial password'), { target: { value: 'Initial-Pass-99' } });
      fireEvent.click(d.getByRole('button', { name: 'Add user' }));
      await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
      expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ username: 'bob', password: 'Initial-Pass-99', role: 'editor' });
    });

    it('validates username and password before calling the API', async () => {
      const { calls } = setup();
      const d = within(await open());
      fireEvent.change(d.getByLabelText('Username'), { target: { value: 'a b' } });
      fireEvent.click(d.getByRole('button', { name: 'Add user' }));
      expect(await d.findByRole('alert')).toHaveTextContent(/3–40 characters/);

      fireEvent.change(d.getByLabelText('Username'), { target: { value: 'valid.name' } });
      fireEvent.change(d.getByLabelText('Initial password'), { target: { value: 'short' } });
      fireEvent.click(d.getByRole('button', { name: 'Add user' }));
      await waitFor(() => expect(d.getByRole('alert')).toHaveTextContent(/at least 10 characters/));
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('maps a duplicate username to a friendly inline message and keeps the dialog open', async () => {
      setup({ [`POST /api/companies/${COMPANY}/users`]: apiError(409, 'conflict', 'conflict') });
      const dialog = await open();
      const d = within(dialog);
      fireEvent.change(d.getByLabelText('Username'), { target: { value: 'editor' } });
      fireEvent.change(d.getByLabelText('Initial password'), { target: { value: 'Initial-Pass-99' } });
      fireEvent.click(d.getByRole('button', { name: 'Add user' }));
      expect(await d.findByRole('alert')).toHaveTextContent('A user with that username already exists in this company.');
      expect(screen.getByRole('dialog', { name: 'Add user' })).toBeInTheDocument();
    });

    it('generates a strong password and copies it to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      setup();
      const d = within(await open());
      const field = d.getByLabelText('Initial password') as HTMLInputElement;
      fireEvent.click(d.getByRole('button', { name: /Generate/ }));
      expect(field.value.length).toBeGreaterThanOrEqual(12);
      expect(field).toHaveAttribute('type', 'text');
      fireEvent.click(d.getByRole('button', { name: /Copy/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
      expect(await screen.findByText('Password copied to clipboard')).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
      setup();
      const dialog = await open();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('changing users', () => {
    it('changes the role inline', async () => {
      const { calls } = setup({
        [`PATCH /api/companies/${COMPANY}/users/u-editor`]: (req) => ({ body: { user: { ...editor, ...(req.body as object) } } }),
      });
      await screen.findByTestId('user-row-editor');
      fireEvent.change(screen.getByLabelText('Role for Eddie Editor'), { target: { value: 'viewer' } });
      await waitFor(() => expect(screen.getByLabelText('Role for Eddie Editor')).toHaveValue('viewer'));
      const patch = calls.find((c) => c.method === 'PATCH')!;
      expect(patch.body).toEqual({ role: 'viewer' });
      expect(patch.headers['X-Requested-With']).toBe('mdhub');
      expect(await screen.findByText('Eddie Editor is now Viewer.')).toBeInTheDocument();
    });

    it('shows a friendly message for the last-admin guard and keeps the old role', async () => {
      const other = makeUser('admin', { id: 'u-admin2', username: 'second', displayName: 'Second Admin' });
      setup({
        [`GET /api/companies/${COMPANY}/users`]: { body: { users: [admin, other] } },
        [`PATCH /api/companies/${COMPANY}/users/u-admin2`]: apiError(409, 'conflict', 'Cannot demote the last active admin of a company'),
      });
      await screen.findByTestId('user-row-second');
      fireEvent.change(screen.getByLabelText('Role for Second Admin'), { target: { value: 'editor' } });
      expect(await screen.findByRole('alert')).toHaveTextContent(/last active admin of a company cannot be demoted/i);
      expect(screen.getByLabelText('Role for Second Admin')).toHaveValue('admin');
    });

    it('disables and enables users', async () => {
      const { calls } = setup({
        [`PATCH /api/companies/${COMPANY}/users/u-editor`]: (req) => ({ body: { user: { ...editor, ...(req.body as object) } } }),
        [`PATCH /api/companies/${COMPANY}/users/u-viewer`]: (req) => ({ body: { user: { ...viewer, ...(req.body as object) } } }),
      });
      await screen.findByTestId('user-row-editor');
      fireEvent.click(row('editor').getByRole('button', { name: /^Disable/ }));
      await waitFor(() => expect(row('editor').getByText('Disabled')).toBeInTheDocument());
      fireEvent.click(row('viewer').getByRole('button', { name: /^Enable/ }));
      await waitFor(() => expect(row('viewer').getByText('Active')).toBeInTheDocument());
      expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ disabled: true }, { disabled: false }]);
    });

    it('resets a password', async () => {
      const { calls } = setup({
        [`PATCH /api/companies/${COMPANY}/users/u-editor`]: { body: { user: editor } },
      });
      await screen.findByTestId('user-row-editor');
      fireEvent.click(row('editor').getByRole('button', { name: /Reset password/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Reset password' });
      const d = within(dialog);
      fireEvent.change(d.getByLabelText('New temporary password'), { target: { value: 'Temporary-Pass-7' } });
      fireEvent.click(d.getByRole('button', { name: 'Reset password' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ password: 'Temporary-Pass-7' });
      expect(screen.getByText('Password reset for Eddie Editor.')).toBeInTheDocument();
    });
  });

  describe('delete', () => {
    it('asks for confirmation, then deletes and removes the row', async () => {
      const { calls } = setup({ [`DELETE /api/companies/${COMPANY}/users/u-editor`]: { status: 204 } });
      await screen.findByTestId('user-row-editor');
      fireEvent.click(row('editor').getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete user' });
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
      await waitFor(() => expect(screen.queryByTestId('user-row-editor')).not.toBeInTheDocument());
      expect(calls.find((c) => c.method === 'DELETE')!.headers['X-Requested-With']).toBe('mdhub');
    });

    it('cancel does nothing', async () => {
      const { calls } = setup();
      await screen.findByTestId('user-row-editor');
      fireEvent.click(row('editor').getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete user' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      expect(screen.getByTestId('user-row-editor')).toBeInTheDocument();
    });

    it('shows guard errors inline in the dialog', async () => {
      const other: User = makeUser('admin', { id: 'u-admin2', username: 'second', displayName: 'Second Admin' });
      setup({
        [`GET /api/companies/${COMPANY}/users`]: { body: { users: [admin, other] } },
        [`DELETE /api/companies/${COMPANY}/users/u-admin2`]: apiError(409, 'conflict', 'The last active admin cannot be deleted'),
      });
      await screen.findByTestId('user-row-second');
      fireEvent.click(row('second').getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete user' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/last active admin of a company cannot be deleted/i);
      expect(screen.getByTestId('user-row-second')).toBeInTheDocument();
    });
  });
});
