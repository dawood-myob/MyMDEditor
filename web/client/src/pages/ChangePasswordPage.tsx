import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../app/auth';
import { Brand } from '../app/Brand';
import { describeError } from '../app/errors';
import { destinationFor, homeFor } from '../app/nav';
import { PasswordField } from '../app/PasswordField';
import { IconAlert, IconInfo } from '../app/ui/icons';
import { Spinner } from '../app/ui/Spinner';
import { useToast } from '../app/ui/Toast';
import { MIN_PASSWORD } from '../app/utils';

function describePasswordError(e: unknown): string {
  if (e instanceof ApiError && (e.code === 'invalid_credentials' || /current password/i.test(e.message))) {
    return 'Your current password is incorrect.';
  }

  return describeError(e, 'Could not change the password. Please try again.');
}

export default function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forced = !!user?.mustChangePassword;

  const validate = (): string | null => {
    if (!current) {
      return 'Enter your current password.';
    }

    if (next.length < MIN_PASSWORD) {
      return `The new password must be at least ${MIN_PASSWORD} characters long.`;
    }

    if (next === current) {
      return 'The new password must be different from the current one.';
    }

    if (next !== confirm) {
      return 'The new password and its confirmation do not match.';
    }

    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) {
      return;
    }

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      await refresh();
      toast.success('Your password has been changed.');
      const target = user ? destinationFor({ role: user.role, mustChangePassword: false }, params.get('next')) : '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(describePasswordError(err));
      setBusy(false);
    }
  };

  return (
    <main className="app-center">
      <section className="app-auth-card card" aria-labelledby="cp-title">
        <div className="app-auth-card__head">
          <Brand size={40} />
          <h1 id="cp-title" className="app-auth-card__title">
            {forced ? 'Choose a new password' : 'Change password'}
          </h1>
          {user && <p className="muted">Signed in as {user.displayName || user.username}</p>}
        </div>

        {forced && (
          <p className="app-alert app-alert--info" role="note">
            <IconInfo size={16} />
            <span>For your security you must set a new password before you can continue.</span>
          </p>
        )}

        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus required />
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" showStrength required />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" required />

          <div className="app-form-error" aria-live="assertive" aria-atomic="true">
            {error && (
              <p className="app-alert app-alert--danger" role="alert">
                <IconAlert size={16} />
                <span>{error}</span>
              </p>
            )}
          </div>

          <button type="submit" className="btn btn-primary app-btn-block" disabled={busy}>
            {busy && <Spinner size={14} />}
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>

        <div className="app-auth-card__foot">
          {!forced && user && (
            <Link to={homeFor(user)}>Cancel</Link>
          )}
          <button
            type="button"
            className="app-link-button"
            onClick={() =>
              void logout()
                .catch(() => undefined)
                .then(() => navigate('/login', { replace: true }))
            }
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

