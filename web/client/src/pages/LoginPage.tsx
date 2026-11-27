import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../app/auth';
import { Brand } from '../app/Brand';
import { describeError } from '../app/errors';
import { PasswordField } from '../app/PasswordField';
import { useTheme } from '../app/theme';
import { IconAlert, IconMoon, IconSun } from '../app/ui/icons';
import { Spinner } from '../app/ui/Spinner';

export const LAST_COMPANY_KEY = 'mdhub.lastCompany';

function readLastCompany(): string {
  try {
    return localStorage.getItem(LAST_COMPANY_KEY) ?? '';
  } catch {
    return '';
  }
}

export function describeLoginError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'invalid_credentials') {
      return 'Incorrect company, username or password. Please check them and try again.';
    }

    if (e.code === 'account_locked') {
      const d = e.details as { retryAfterSeconds?: number; retryAfter?: number } | undefined;
      const seconds = d?.retryAfterSeconds ?? d?.retryAfter;
      const wait = typeof seconds === 'number' && seconds > 0 ? `about ${Math.max(1, Math.ceil(seconds / 60))} minute(s)` : 'about 15 minutes';
      return `This account is temporarily locked after too many failed sign-in attempts. Try again in ${wait}, or ask an administrator to reset your password.`;
    }

    if (e.code === 'rate_limited') {
      return 'Too many sign-in attempts from your network. Please wait a minute and try again.';
    }
  }

  return describeError(e, 'Could not sign in. Please try again.');
}

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const [company, setCompany] = useState(readLastCompany);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberedCompany] = useState(company);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) {
      return;
    }

    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }

    setBusy(true);
    setError(null);
    const slug = company.trim().toLowerCase();
    try {
      await login(slug, username.trim(), password);
      try {
        localStorage.setItem(LAST_COMPANY_KEY, slug);
      } catch {
        // storage unavailable: not remembering the company is harmless
      }
    } catch (err) {
      setError(describeLoginError(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-center app-login">
      <button
        type="button"
        className="btn btn-ghost btn-icon app-login__theme"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
      <section className="app-auth-card card" aria-labelledby="login-title">
        <div className="app-auth-card__head">
          <Brand size={40} />
          <h1 id="login-title" className="app-auth-card__title">
            Sign in
          </h1>
          <p className="muted">Collaborative Markdown documentation for your team.</p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <div className="field">
            <label htmlFor="login-company">Company</label>
            <input
              id="login-company"
              className="input"
              name="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="organization"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={!rememberedCompany}
              aria-describedby="login-company-hint"
            />
            <span id="login-company-hint" className="app-hint muted">
              Leave empty if you are the platform administrator
            </span>
          </div>

          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              className="input"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={!!rememberedCompany}
              required
            />
          </div>

          <PasswordField
            label="Password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />

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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

