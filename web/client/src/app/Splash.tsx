import { Brand } from './Brand';
import { Spinner } from './ui/Spinner';

export function Splash({ label = 'Loading MDHub…' }: { label?: string }) {
  return (
    <div className="app-splash" role="status" aria-live="polite">
      <Brand size={44} />
      <div className="app-splash__row">
        <Spinner size={16} />
        <span>{label}</span>
      </div>
    </div>
  );
}
