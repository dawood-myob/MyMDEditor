import { ApiError } from '../api/client';

/** Turns any thrown value into a message that is safe and useful to show to people. */
export function describeError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'csrf':
        return 'Your page is out of date. Reload it and try again.';
      case 'unauthorized':
        return 'Your session has expired. Please sign in again.';
      case 'rate_limited':
        return 'Too many requests. Please wait a moment and try again.';
      case 'not_found':
        return 'That item no longer exists. Refresh the page and try again.';
      case 'payload_too_large':
        return 'That request is too large.';
      case 'internal':
        return 'The server ran into a problem. Please try again in a moment.';
      default:
        return e.message || fallback;
    }
  }

  if (e instanceof TypeError) {
    return "Can't reach the server. Check your connection and try again.";
  }

  return e instanceof Error && e.message ? e.message : fallback;
}

export type UserAction = 'create' | 'update' | 'role' | 'disable' | 'delete' | 'reset';

/** Friendly wording for the guard errors the users API raises (last admin, acting on yourself). */
export function describeUserError(e: unknown, action: UserAction): string {
  if (e instanceof ApiError && ['conflict', 'forbidden', 'validation'].includes(e.code)) {
    const text = e.message ?? '';
    if (/last\s+(active\s+)?admin|only\s+(active\s+)?admin/i.test(text)) {
      const what = action === 'delete' ? 'deleted' : action === 'disable' ? 'disabled' : 'demoted';
      return `The last active admin of a company cannot be ${what}. Make another user an admin first.`;
    }

    if (/yourself|your own|own account|\bself\b/i.test(text)) {
      return action === 'delete'
        ? "You can't delete your own account."
        : action === 'disable'
          ? "You can't disable your own account."
          : "You can't do that to your own account.";
    }

    if (e.code === 'conflict' && action === 'create') {
      return 'A user with that username already exists in this company.';
    }
  }

  return describeError(e);
}
