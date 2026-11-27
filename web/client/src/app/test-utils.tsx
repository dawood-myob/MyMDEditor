import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import type { Company, Role, User } from '../api/types';
import { AuthProvider } from './auth';
import { ThemeProvider } from './theme';
import { ToastProvider } from './ui/Toast';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockReply { status?: number; body?: unknown }
export type MockHandler = MockReply | ((req: RecordedRequest) => MockReply | Promise<MockReply>);

/** Replaces global fetch. Keys look like `GET /api/auth/me`. Returns the recorded calls. */
export function installFetch(routes: Record<string, MockHandler>) {
  const calls: RecordedRequest[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const req: RecordedRequest = {
      method,
      url,
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(req);

    const path = url.split('?')[0];
    const handler = routes[`${method} ${url}`] ?? routes[`${method} ${path}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'internal', message: `unmocked ${method} ${url}` } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const reply = typeof handler === 'function' ? await handler(req) : handler;
    const status = reply.status ?? 200;
    if (status === 204) {
      return new Response(null, { status });
    }

    return new Response(JSON.stringify(reply.body ?? {}), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export const apiError = (status: number, code: string, message: string, details?: unknown): MockReply => ({
  status,
  body: { error: { code, message, details } },
});

export function makeUser(role: Role = 'editor', overrides: Partial<User> = {}): User {
  const isSuper = role === 'superadmin';
  return {
    id: `${role}-id`,
    username: role,
    displayName: `${role[0].toUpperCase()}${role.slice(1)} Person`,
    role,
    companyId: isSuper ? null : 'company-1',
    companyName: isSuper ? null : 'Acme Corp',
    companySlug: isSuper ? null : 'acme',
    mustChangePassword: false,
    disabled: false,
    createdAt: '2025-01-15T10:00:00.000Z',
    ...overrides,
  };
}

export function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    name: 'Acme Corp',
    slug: 'acme',
    disabled: false,
    userCount: 3,
    documentCount: 12,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

/** Renders inside the same providers as main.tsx (but with a MemoryRouter). */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <ToastProvider>
            {ui}
            <LocationProbe />
          </ToastProvider>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}
