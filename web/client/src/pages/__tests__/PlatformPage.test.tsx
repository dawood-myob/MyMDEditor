import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { apiError, installFetch, makeCompany, makeUser, renderWithProviders, type MockHandler } from '../../app/test-utils';

vi.mock('../../workspace/WorkspacePage', () => ({ default: () => <div>Workspace stub</div> }));

const acme = makeCompany({ id: 'c-acme', name: 'Acme Corp', slug: 'acme', userCount: 3, documentCount: 12 });
const globex = makeCompany({ id: 'c-globex', name: 'Globex', slug: 'globex', disabled: true, userCount: 1, documentCount: 0 });

function setup(extra: Record<string, MockHandler> = {}, route = '/platform') {
  const mock = installFetch({
    'GET /api/auth/me': { body: { user: makeUser('superadmin', { id: 'root' }) } },
    'GET /api/platform/companies': { body: { companies: [acme, globex] } },
    ...extra,
  });
  renderWithProviders(<App />, { route });
  return mock;
}

const row = (slug: string) => within(screen.getByTestId(`company-row-${slug}`));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Platform console', () => {
  it('lists companies with counts and status badges', async () => {
    setup();
    await screen.findByTestId('company-row-acme');
    expect(row('acme').getByText('3')).toBeInTheDocument();
    expect(row('acme').getByText('12')).toBeInTheDocument();
    expect(row('acme').getByText('Active')).toBeInTheDocument();
    expect(row('globex').getByText('Disabled')).toBeInTheDocument();
  });

  it('filters by name or slug', async () => {
    setup();
    await screen.findByTestId('company-row-acme');
    fireEvent.change(screen.getByLabelText('Search companies'), { target: { value: 'glob' } });
    expect(screen.queryByTestId('company-row-acme')).not.toBeInTheDocument();
    expect(screen.getByTestId('company-row-globex')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search companies'), { target: { value: 'nothing' } });
    expect(screen.getByText('No matching companies')).toBeInTheDocument();
  });

  it('shows an empty state and an error banner with retry', async () => {
    let attempts = 0;
    setup({ 'GET /api/platform/companies': () => (++attempts === 1 ? apiError(500, 'internal', 'x') : { body: { companies: [] } }) });
    expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No companies yet')).toBeInTheDocument();
  });

  it('opens the company page when a row is clicked and shows its users', async () => {
    setup({ 'GET /api/companies/c-acme/users': { body: { users: [makeUser('admin', { username: 'acme-admin' })] } } });
    const cell = await screen.findByText('Acme Corp', { selector: 'a' });
    fireEvent.click(cell.closest('tr')!.querySelectorAll('td')[1]);
    expect(await screen.findByRole('heading', { name: /Acme Corp/ })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/platform/companies/c-acme');
    expect(await screen.findByTestId('user-row-acme-admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin console' })).toHaveAttribute('href', '/platform');
  });

  describe('new company', () => {
    it('suggests the slug from the name until it is edited, then posts the payload', async () => {
      const created = makeCompany({ id: 'c-new', name: 'Initech Ltd', slug: 'initech', userCount: 1, documentCount: 0 });
      const { calls } = setup({ 'POST /api/platform/companies': { status: 201, body: { company: created } } });
      await screen.findByTestId('company-row-acme');
      fireEvent.click(screen.getByRole('button', { name: /New company/ }));
      const d = within(await screen.findByRole('dialog', { name: 'New company' }));

      fireEvent.change(d.getByLabelText('Company name'), { target: { value: 'Initech Ltd' } });
      expect(d.getByLabelText('Slug')).toHaveValue('initech-ltd');
      fireEvent.change(d.getByLabelText('Slug'), { target: { value: 'initech' } });
      fireEvent.change(d.getByLabelText('Company name'), { target: { value: 'Initech Ltd.' } });
      expect(d.getByLabelText('Slug')).toHaveValue('initech');

      fireEvent.change(d.getByLabelText('Admin username'), { target: { value: 'boss' } });
      fireEvent.change(d.getByLabelText('Admin display name'), { target: { value: 'Big Boss' } });
      fireEvent.click(d.getByRole('button', { name: /Generate/ }));
      const password = (d.getByLabelText('Admin password') as HTMLInputElement).value;
      expect(password.length).toBeGreaterThanOrEqual(12);
      fireEvent.click(d.getByRole('button', { name: 'Create company' }));

      expect(await screen.findByTestId('company-row-initech')).toBeInTheDocument();
      const post = calls.find((c) => c.method === 'POST')!;
      expect(post.url).toBe('/api/platform/companies');
      expect(post.headers['X-Requested-With']).toBe('mdhub');
      expect(post.body).toEqual({ name: 'Initech Ltd.', slug: 'initech', adminUsername: 'boss', adminPassword: password, adminDisplayName: 'Big Boss' });
    });

    it('validates input and surfaces API conflicts', async () => {
      setup({ 'POST /api/platform/companies': apiError(409, 'conflict', 'A company with this slug already exists') });
      await screen.findByTestId('company-row-acme');
      fireEvent.click(screen.getByRole('button', { name: /New company/ }));
      const d = within(await screen.findByRole('dialog', { name: 'New company' }));
      fireEvent.click(d.getByRole('button', { name: 'Create company' }));
      expect(await d.findByRole('alert')).toHaveTextContent(/enter the company name/i);

      fireEvent.change(d.getByLabelText('Company name'), { target: { value: 'Acme Corp' } });
      fireEvent.change(d.getByLabelText('Admin username'), { target: { value: 'boss' } });
      fireEvent.change(d.getByLabelText('Admin password'), { target: { value: 'A-Long-Password-1' } });
      fireEvent.click(d.getByRole('button', { name: 'Create company' }));
      await waitFor(() => expect(d.getByRole('alert')).toHaveTextContent('A company with this slug already exists'));
    });
  });

  describe('enable / disable', () => {
    it('asks before disabling, then patches', async () => {
      const { calls } = setup({ 'PATCH /api/platform/companies/c-acme': { body: { company: { ...acme, disabled: true } } } });
      await screen.findByTestId('company-row-acme');
      fireEvent.click(row('acme').getByRole('button', { name: /Disable/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Disable company' });
      expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Disable company' }));
      await waitFor(() => expect(row('acme').getByText('Disabled')).toBeInTheDocument());
      expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ disabled: true });
    });

    it('enables immediately', async () => {
      const { calls } = setup({ 'PATCH /api/platform/companies/c-globex': { body: { company: { ...globex, disabled: false } } } });
      await screen.findByTestId('company-row-globex');
      fireEvent.click(row('globex').getByRole('button', { name: /Enable/ }));
      await waitFor(() => expect(row('globex').getByText('Active')).toBeInTheDocument());
      expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ disabled: false });
    });
  });

  describe('delete', () => {
    it('requires typing the slug and sends it as the confirm parameter', async () => {
      const { calls } = setup({ 'DELETE /api/platform/companies/c-acme': { status: 204 } });
      await screen.findByTestId('company-row-acme');
      fireEvent.click(row('acme').getByRole('button', { name: /Delete/ }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Delete company' }));
      const confirm = dialog.getByRole('button', { name: /Delete company permanently/ });
      expect(confirm).toBeDisabled();

      fireEvent.change(dialog.getByLabelText(/Type/), { target: { value: 'globex' } });
      expect(confirm).toBeDisabled();
      fireEvent.change(dialog.getByLabelText(/Type/), { target: { value: 'acme' } });
      fireEvent.click(confirm);

      await waitFor(() => expect(screen.queryByTestId('company-row-acme')).not.toBeInTheDocument());
      const del = calls.find((c) => c.method === 'DELETE')!;
      expect(del.url).toBe('/api/platform/companies/c-acme?confirm=acme');
      expect(del.headers['X-Requested-With']).toBe('mdhub');
      expect(screen.getByTestId('company-row-globex')).toBeInTheDocument();
    });

    it('shows API errors inline and keeps the company', async () => {
      setup({ 'DELETE /api/platform/companies/c-acme': apiError(400, 'validation', 'confirm does not match the slug') });
      await screen.findByTestId('company-row-acme');
      fireEvent.click(row('acme').getByRole('button', { name: /Delete/ }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Delete company' }));
      fireEvent.change(dialog.getByLabelText(/Type/), { target: { value: 'acme' } });
      fireEvent.click(dialog.getByRole('button', { name: /Delete company permanently/ }));
      expect(await dialog.findByRole('alert')).toHaveTextContent('confirm does not match the slug');
      expect(screen.getByTestId('company-row-acme')).toBeInTheDocument();
    });
  });
});
