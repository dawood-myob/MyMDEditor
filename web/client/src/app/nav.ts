import type { User } from '../api/types';

/** Accepts only same-origin absolute paths so `?next=` can never become an open redirect. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return null;
  }

  if (raw === '/login' || raw.startsWith('/login?') || raw === '/change-password' || raw.startsWith('/change-password?')) {
    return null;
  }

  return raw;
}

export function homeFor(user: Pick<User, 'role'>): string {
  return user.role === 'superadmin' ? '/platform' : '/';
}

/** Where a signed-in user should land (after login, after password change, or when visiting /login). */
export function destinationFor(user: Pick<User, 'role' | 'mustChangePassword'>, next: string | null | undefined): string {
  const target = safeNext(next);
  if (user.mustChangePassword) {
    return '/change-password' + (target && target !== '/' ? `?next=${encodeURIComponent(target)}` : '');
  }

  if (!target) {
    return homeFor(user);
  }

  if (user.role === 'superadmin') {
    return target.startsWith('/platform') ? target : '/platform';
  }

  return target.startsWith('/platform') ? '/' : target;
}
