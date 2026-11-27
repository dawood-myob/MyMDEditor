import { useId, useState } from 'react';
import { copyText, generatePassword, MIN_PASSWORD, passwordStrength } from './utils';
import { IconCopy, IconEye, IconEyeOff, IconWand } from './ui/icons';
import { useToast } from './ui/Toast';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: 'current-password' | 'new-password';
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  invalid?: boolean;
  /** Shows a strength bar and the minimum-length hint. */
  showStrength?: boolean;
  /** Adds "Generate" and "Copy" helpers (for admins who set passwords on behalf of someone else). */
  generator?: boolean;
  name?: string;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  required,
  disabled,
  hint,
  invalid,
  showStrength,
  generator,
  name,
}: PasswordFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);
  const toast = useToast();
  const strength = passwordStrength(value);

  return (
    <div className="field app-password">
      <label htmlFor={id}>{label}</label>
      <div className="app-password__row">
        <input
          id={id}
          name={name}
          className="input app-password__input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={hint || showStrength ? hintId : undefined}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={200}
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon app-password__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
      {showStrength && (
        <div className="app-strength" id={hintId}>
          <div className={`app-strength__bar app-strength__bar--${strength.score}`} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <span className={value.length >= MIN_PASSWORD ? 'app-strength__ok' : 'muted'}>
            {value ? `${strength.label} · ` : ''}
            At least {MIN_PASSWORD} characters
          </span>
        </div>
      )}
      {!showStrength && hint && (
        <span className="app-hint muted" id={hintId}>
          {hint}
        </span>
      )}
      {generator && (
        <div className="app-password__tools">
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => {
              onChange(generatePassword());
              setVisible(true);
            }}
          >
            <IconWand /> Generate
          </button>
          <button
            type="button"
            className="btn"
            disabled={disabled || !value}
            onClick={() => void copyText(value).then((ok) => (ok ? toast.success('Password copied to clipboard') : toast.error('Could not copy. Select and copy it manually.')))}
          >
            <IconCopy /> Copy
          </button>
        </div>
      )}
    </div>
  );
}
