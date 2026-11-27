import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../../api/types';
import { UserMenu } from '../UserMenu';
import { installFetch, makeUser, renderWithProviders } from '../test-utils';

function setup(role: Role = 'admin') {
  const mock = installFetch({
    'GET /api/auth/me': { body: { user: makeUser(role, { username: 'jdoe', displayName: 'Jane Doe' }) } },
    'POST /api/auth/logout': { status: 204 },
  });
  renderWithProviders(<UserMenu />, { route: '/somewhere' });
  return mock;
}

const openMenu = async () => {
  const button = await screen.findByRole('button', { name: 'Account menu for Jane Doe' });
  fireEvent.click(button);
  return button;
};

beforeEach(() => {
  localStorage.setItem('mdhub.theme', 'light');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('UserMenu', () => {
  it('shows an avatar button with the initials and a closed menu', async () => {
    setup();
    const button = await screen.findByRole('button', { name: 'Account menu for Jane Doe' });
    expect(button).toHaveTextContent('JD');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows identity details, company and role badge when opened', async () => {
    setup('admin');
    const button = await openMenu();
    const menu = screen.getByRole('menu');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveTextContent('Jane Doe');
    expect(menu).toHaveTextContent('@jdoe');
    expect(menu).toHaveTextContent('Acme Corp');
    expect(menu).toHaveTextContent('Admin');
  });

  it('offers "Manage users" to company admins only', async () => {
    setup('admin');
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /Manage users/ })).toHaveAttribute('href', '/admin/users');
    expect(screen.queryByRole('menuitem', { name: /Admin console/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Change password/ })).toHaveAttribute('href', '/change-password');
    expect(screen.getByRole('menuitem', { name: /Sign out/ })).toBeInTheDocument();
  });

  it('offers the "Admin console" to the superadmin only', async () => {
    setup('superadmin');
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /Admin console/ })).toHaveAttribute('href', '/platform');
    expect(screen.queryByRole('menuitem', { name: /Manage users/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menu')).toHaveTextContent('Platform admin');
  });

  it.each(['editor', 'viewer'] as const)('shows neither admin entry to %s', async (role) => {
    setup(role);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: /Manage users/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Admin console/ })).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', async () => {
    setup();
    const button = await openMenu();
    await waitFor(() => expect(screen.getAllByRole('menuitem')[0]).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on an outside click but not on an inside click', async () => {
    setup();
    await openMenu();
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('supports arrow-key navigation with wrap-around', async () => {
    setup('admin');
    await openMenu();
    const items = screen.getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: 'End' });
    expect(items[items.length - 1]).toHaveFocus();
    fireEvent.keyDown(items[items.length - 1], { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(items[items.length - 1]).toHaveFocus();
  });

  it('opens with ArrowDown on the trigger', async () => {
    setup();
    const button = await screen.findByRole('button', { name: 'Account menu for Jane Doe' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('toggles the theme', async () => {
    setup();
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch to dark theme' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('signs out through the API and goes to /login', async () => {
    const { calls } = setup();
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    const logout = calls.find((c) => c.url === '/api/auth/logout')!;
    expect(logout.method).toBe('POST');
    expect(logout.headers['X-Requested-With']).toBe('mdhub');
  });
});
