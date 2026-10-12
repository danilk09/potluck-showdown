import { FRAMES } from '../lib/frames';
import { useProfiles } from '../hooks/useProfiles';

const COLORS = ['#f2553a', '#2f8f5b', '#6b4fd3', '#e0902a', '#2b7bb9', '#c2417a', '#4f8a3a'];

function colorFor(seed = '') {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

/**
 * Profile picture with the owner's chosen win frame. This is the only place
 * other people's profiles surface: a name, a photo, and the frame they earned.
 */
export default function Avatar({ profile, uid, size = 40, medal = true, className = '', title }) {
  const name = profile?.displayName ?? (profile === null ? 'Former guest' : '');
  const tier = profile?.frame?.tier;
  const frame = tier && FRAMES[tier];
  return (
    <span
      className={`avatar ${frame ? `framed frame-${tier}` : ''} ${className}`}
      style={{ '--size': `${size}px` }}
      title={title ?? (frame ? `${name} · ${frame.label}` : name)}
    >
      {profile?.photoURL ? (
        <img className="avatar-img" src={profile.photoURL} alt={name} />
      ) : (
        <span className="avatar-img" style={{ background: colorFor(uid ?? name) }} aria-label={name}>
          {initials(name)}
        </span>
      )}
      {frame && medal && size >= 32 && <span className="avatar-medal" aria-hidden>{frame.medal}</span>}
    </span>
  );
}

export function UserAvatar({ uid, ...rest }) {
  const lookup = useProfiles([uid]);
  return <Avatar uid={uid} profile={lookup(uid)} {...rest} />;
}

export function AvatarStack({ uids, max = 3, size = 34 }) {
  const shown = uids.slice(0, max);
  const lookup = useProfiles(shown);
  return (
    <span className="avatar-stack">
      {shown.map((id) => <Avatar key={id} uid={id} profile={lookup(id)} size={size} medal={false} />)}
      {uids.length > max && <span className="more">+{uids.length - max}</span>}
    </span>
  );
}

/** Avatar + display name, used on feed posts and dish pages. */
export function AuthorLine({ uid, size = 36, sub }) {
  const lookup = useProfiles([uid]);
  const p = lookup(uid);
  return (
    <span className="d-flex align-items-center gap-2 min-w-0">
      <Avatar uid={uid} profile={p} size={size} />
      <span className="min-w-0">
        <span className="fw-bold d-block text-truncate">{p?.displayName ?? (p === null ? 'Former guest' : '…')}</span>
        {sub && <span className="small text-muted d-block text-truncate">{sub}</span>}
      </span>
    </span>
  );
}
