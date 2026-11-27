import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { User } from '../../api/types';
import { apiError, installFetch, makeCompany, makeUser, renderWithProviders, type MockHandler } from '../test-utils';

vi.mock('../../workspace/WorkspacePage', () => ({ default: () => <div>Workspace stub</div> }));

const location = () => screen.getByTestId('location').textContent;

function baseRoutes(me: User | null, extra: Record<string, MockHandler> = {}) {
  return {
    'GET /api/auth/me': me ? { body: { user: me } } : apiError(401, 'unauthorized', 'Not signed in'),
    'GET /api/platform/companies': { body: { companies: [makeCompany()] } },
    'GET /api/companies/company-1/users': { body: { users: [makeUser('admin')] } },
    ...extra,
  };
}

async function fillAndSubmitLogin(values: { company?: string; username: string; password: string }) {
  await screen.findByRole('heading', { name: 'Sign in' });
  if (values.company !== undefined) {
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: values.company } });
  }

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: values.username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('route guards', () => {
  it('shows a loading splash while the session is being checked', () => {
    installFetch({ 'GET /api/auth/me': () => new Promise<never>(() => undefined) });
    renderWithProviders(<App />, { route: '/' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading MDHub');
  });

  it('redirects signed-out users to /login and remembers the target in ?next=', async () => {
    installFetch(baseRoutes(null));
    renderWithProviders(<App />, { route: '/d/abc-123' });
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(location()).toBe('/login?next=%2Fd%2Fabc-123');
  });

  it('forces users with mustChangePassword to /change-password', async () => {
    installFetch(baseRoutes(makeUser('editor', { mustChangePassword: true })));
    renderWithProviders(<App />, { route: '/d/abc' });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    expect(location()).toBe('/change-password?next=%2Fd%2Fabc');
    expect(screen.getByText(/must set a new password/i)).toBeInTheDocument();
    expect(screen.queryByText('Workspace stub')).not.toBeInTheDocument();
  });

  it('lets editors open the workspace and a specific document', async () => {
    installFetch(baseRoutes(makeUser('editor')));
    renderWithProviders(<App />, { route: '/d/abc' });
    expect(await screen.findByText('Workspace stub')).toBeInTheDocument();
    expect(location()).toBe('/d/abc');
  });

  it('sends the superadmin from / to the platform console', async () => {
    installFetch(baseRoutes(makeUser('superadmin')));
    renderWithProviders(<App />, { route: '/' });
    await screen.findByRole('heading', { name: 'Companies' });
    expect(location()).toBe('/platform');
    expect(await screen.findByRole('link', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  it.each([
    ['editor', '/admin/users'],
    ['viewer', '/platform'],
    ['admin', '/platform'],
  ] as const)('denies %s access to %s', async (role, path) => {
    installFetch(baseRoutes(makeUser(role)));
    renderWithProviders(<App />, { route: path });
    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
  });

  it('allows company admins on /admin/users and shows their company', async () => {
    installFetch(baseRoutes(makeUser('admin')));
    renderWithProviders(<App />, { route: '/admin/users' });
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(await screen.findByTestId('user-row-admin')).toBeInTheDocument();
  });

  it('redirects a signed-in superadmin away from company-only pages', async () => {
    installFetch(baseRoutes(makeUser('superadmin')));
    renderWithProviders(<App />, { route: '/admin/users' });
    await screen.findByRole('heading', { name: 'Companies' });
    expect(location()).toBe('/platform');
  });

  it('shows a not-found page for unknown routes', async () => {
    installFetch(baseRoutes(makeUser('editor')));
    renderWithProviders(<App />, { route: '/nope/never' });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('login flow', () => {
  it('posts credentials with the CSRF header and lands on the workspace for an editor', async () => {
    let signedIn = false;
    const { calls } = installFetch(
      baseRoutes(null, {
        'GET /api/auth/me': () => (signedIn ? { body: { user: makeUser('editor') } } : apiError(401, 'unauthorized', 'no')),
        'POST /api/auth/login': () => {
          signedIn = true;
          return { body: { user: makeUser('editor') } };
        },
      }),
    );
    renderWithProviders(<App />, { route: '/login' });
    await fillAndSubmitLogin({ company: ' Acme ', username: 'editor', password: 'Demo-Pass-1234' });

    expect(await screen.findByText('Workspace stub')).toBeInTheDocument();
    const login = calls.find((c) => c.url === '/api/auth/login')!;
    expect(login.method).toBe('POST');
    expect(login.headers['X-Requested-With']).toBe('mdhub');
    expect(login.body).toEqual({ company: 'acme', username: 'editor', password: 'Demo-Pass-1234' });
    expect(localStorage.getItem('mdhub.lastCompany')).toBe('acme');
  });

  it('returns to the originally requested page after login', async () => {
    installFetch(
      baseRoutes(null, { 'POST /api/auth/login': { body: { user: makeUser('viewer') } } }),
    );
    renderWithProviders(<App />, { route: '/d/doc-9' });
    await fillAndSubmitLogin({ company: 'acme', username: 'viewer', password: 'Demo-Pass-1234' });
    expect(await screen.findByText('Workspace stub')).toBeInTheDocument();
    expect(location()).toBe('/d/doc-9');
  });

  it('sends the platform administrator to /platform and omits the empty company', async () => {
    const { calls } = installFetch(
      baseRoutes(null, { 'POST /api/auth/login': { body: { user: makeUser('superadmin') } } }),
    );
    renderWithProviders(<App />, { route: '/login?next=%2Fd%2Fdoc-9' });
    await fillAndSubmitLogin({ username: 'admin', password: 'Admin-Pass-1234' });
    await screen.findByRole('heading', { name: 'Companies' });
    expect(location()).toBe('/platform');
    const login = calls.find((c) => c.url === '/api/auth/login')!;
    expect(login.body).toEqual({ username: 'admin', password: 'Admin-Pass-1234' });
  });

  it('sends a first-login user to the forced password change', async () => {
    installFetch(
      baseRoutes(null, { 'POST /api/auth/login': { body: { user: makeUser('admin', { mustChangePassword: true }) } } }),
    );
    renderWithProviders(<App />, { route: '/login' });
    await fillAndSubmitLogin({ company: 'acme', username: 'admin', password: 'Temp-Pass-12345' });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    expect(location()).toBe('/change-password');
  });

  it('prefills the last used company and focuses the first field', async () => {
    localStorage.setItem('mdhub.lastCompany', 'globex');
    installFetch(baseRoutes(null));
    renderWithProviders(<App />, { route: '/login' });
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.getByLabelText('Company')).toHaveValue('globex');
    expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it('autofocuses the company field on a fresh browser and explains the empty value', async () => {
    installFetch(baseRoutes(null));
    renderWithProviders(<App />, { route: '/login' });
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.getByLabelText('Company')).toHaveFocus();
    expect(screen.getByText('Leave empty if you are the platform administrator')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    installFetch(baseRoutes(null));
    renderWithProviders(<App />, { route: '/login' });
    await screen.findByRole('heading', { name: 'Sign in' });
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows the API error for invalid credentials in an alert and stays on the page', async () => {
    installFetch(
      baseRoutes(null, { 'POST /api/auth/login': apiError(401, 'invalid_credentials', 'Invalid credentials') }),
    );
    renderWithProviders(<App />, { route: '/login' });
    await fillAndSubmitLogin({ company: 'acme', username: 'editor', password: 'wrong-password' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect company, username or password/i);
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(location()).toBe('/login');
  });

  it('explains a locked account with a retry hint', async () => {
    installFetch(baseRoutes(null, { 'POST /api/auth/login': apiError(423, 'account_locked', 'Account locked') }));
    renderWithProviders(<App />, { route: '/login' });
    await fillAndSubmitLogin({ company: 'acme', username: 'editor', password: 'wrong-password' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/temporarily locked/i);
    expect(alert).toHaveTextContent(/15 minutes/i);
  });

  it('explains rate limiting', async () => {
    installFetch(baseRoutes(null, { 'POST /api/auth/login': apiError(429, 'rate_limited', 'Slow down') }));
    renderWithProviders(<App />, { route: '/login' });
    await fillAndSubmitLogin({ company: 'acme', username: 'editor', password: 'x-password-1' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many sign-in attempts/i);
  });

  it('validates empty fields without calling the API', async () => {
    const { calls } = installFetch(baseRoutes(null));
    renderWithProviders(<App />, { route: '/login' });
    await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your username and password/i);
    expect(calls.some((c) => c.url === '/api/auth/login')).toBe(false);
  });

  it('redirects an already signed-in user away from /login', async () => {
    installFetch(baseRoutes(makeUser('editor')));
    renderWithProviders(<App />, { route: '/login' });
    expect(await screen.findByText('Workspace stub')).toBeInTheDocument();
    expect(location()).toBe('/');
  });

  it('ignores unsafe ?next values', async () => {
    installFetch(baseRoutes(makeUser('editor')));
    renderWithProviders(<App />, { route: '/login?next=https%3A%2F%2Fevil.example' });
    expect(await screen.findByText('Workspace stub')).toBeInTheDocument();
    expect(location()).toBe('/');
  });
});

describe('change password', () => {
  it('validates, posts the change, refreshes the session and goes to the requested page', async () => {
    let changed = false;
    const { calls } = installFetch(
      baseRoutes(null, {
        'GET /api/auth/me': () => ({ body: { user: makeUser('editor', { mustChangePassword: !changed }) } }),
        'POST /api/auth/change-password': () => {
          changed = true;
          return { status: 204 };
        },
      }),
    );
    renderWithProviders(<App />, { route: '/d/abc' });
    await screen.findByRole('heading', { name: 'Choose a new password' });

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'Temp-Pass-12345' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 10 characters/i);

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'A-Much-Better-Pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i));
    expect(calls.some((c) => c.url === '/api/auth/change-password')).toBe(false);

    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'A-Much-Better-Pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Workspace stub')).toBeInTheDocument();
    expect(location()).toBe('/d/abc');
    const post = calls.find((c) => c.url === '/api/auth/change-password')!;
    expect(post.headers['X-Requested-With']).toBe('mdhub');
    expect(post.body).toEqual({ currentPassword: 'Temp-Pass-12345', newPassword: 'A-Much-Better-Pass-1' });
  });

  it('shows a friendly message when the current password is wrong', async () => {
    installFetch(
      baseRoutes(makeUser('editor'), {
        'POST /api/auth/change-password': apiError(401, 'invalid_credentials', 'Invalid credentials'),
      }),
    );
    renderWithProviders(<App />, { route: '/change-password' });
    await screen.findByRole('heading', { name: 'Change password' });
    expect(screen.queryByText(/must set a new password/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'nope-nope-nope' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'A-Much-Better-Pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'A-Much-Better-Pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect.');
  });

  it('lets the user sign out from the forced page', async () => {
    const { calls } = installFetch(
      baseRoutes(makeUser('editor', { mustChangePassword: true }), { 'POST /api/auth/logout': { status: 204 } }),
    );
    renderWithProviders(<App />, { route: '/' });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(calls.some((c) => c.url === '/api/auth/logout' && c.method === 'POST')).toBe(true);
    expect(location()).toBe('/login');
  });
});
