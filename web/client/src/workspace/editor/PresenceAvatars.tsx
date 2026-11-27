import type { Collaborator } from '../state/useCollab';
import { initials } from '../lib/color';

const MAX_VISIBLE = 5;

/** Avatars of the other people in this document (deduplicated per user). The tooltip names them and says whether they are editing. */
export function PresenceAvatars({ people }: { people: Collaborator[] }) {
  if (people.length === 0) {
    return (
      <span className="ws-presence is-empty" data-testid="presence" aria-label="You are the only one here">
        <span className="muted">Only you</span>
      </span>
    );
  }

  const shown = people.slice(0, MAX_VISIBLE);
  const extra = people.length - shown.length;
  return (
    <ul className="ws-presence" data-testid="presence" aria-label={`${people.length} other ${people.length === 1 ? 'person' : 'people'} in this document`}>
      {shown.map((p) => {
        const state = p.editing ? 'editing' : 'viewing';
        return (
          <li
            key={p.userId}
            className={`ws-avatar${p.editing ? ' is-editing' : ''}`}
            style={{ backgroundColor: p.color }}
            title={`${p.name} — ${state}`}
            aria-label={`${p.name} (${state})`}
            data-user-id={p.userId}
            data-state={state}
          >
            {initials(p.name)}
          </li>
        );
      })}
      {extra > 0 && (
        <li className="ws-avatar is-more" title={people.slice(MAX_VISIBLE).map((p) => p.name).join(', ')} aria-label={`${extra} more`}>
          +{extra}
        </li>
      )}
    </ul>
  );
}
