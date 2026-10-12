import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ImpactStyle } from '@capacitor/haptics';
import { Alert, Button } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useDishes, useMyRatings, useNow, usePotluck } from '../hooks/useFirestore';
import { useProfiles } from '../hooks/useProfiles';
import { friendlyError, submitRating } from '../data/api';
import { phaseOf } from '../lib/phase';
import { formatDuration } from '../lib/dates';
import { toMillis } from '../lib/scoring';
import { tapFeedback } from '../lib/platform';
import Avatar from '../components/Avatar';
import { EmptyState, FsImage, Loading, PageHeader, StarRating, useToast } from '../components/ui';

const PROMPTS = {
  Deliciousness: 'Would you sneak back for seconds?',
  Healthiness: 'How balanced and nourishing is it?',
  Creativity: 'How unique and creative was the dish?',
  Presentation: 'How good does it look on the plate?',
  'Theme fit': 'How well does it fit the challenge?',
};

export default function RateDish() {
  const { pid, did } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(30_000);
  const { data: potluck, loading } = usePotluck(pid);
  const isMember = Boolean(potluck?.memberIds.includes(user.uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);
  const { ratings, loading: ratingsLoading } = useMyRatings(pid, isMember);
  const dish = dishes.find((d) => d.id === did);
  const author = useProfiles([dish?.authorId])(dish?.authorId);
  const [scores, setScores] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading || dishesLoading || ratingsLoading) return <Loading />;
  if (!potluck || !isMember || !dish) return <div className="page"><PageHeader title="Rate this dish" /><EmptyState title="Dish not found" /></div>;

  const phase = phaseOf(potluck, now);
  const back = <Button as={Link} to={`/feed/${pid}`}>Back to the feed</Button>;
  if (dish.authorId === user.uid) return <div className="page"><PageHeader title="Rate this dish" /><EmptyState emoji="🙈" title="That’s your dish!" action={back}>You can’t rate your own dish.</EmptyState></div>;
  if (ratings.has(did)) return <div className="page"><PageHeader title="Rate this dish" /><EmptyState emoji="✅" title="Already rated" action={back}>Votes are final. Thanks for judging!</EmptyState></div>;
  if (phase !== 'voting') {
    return (
      <div className="page"><PageHeader title="Rate this dish" />
        <EmptyState emoji="⏳" title={phase === 'open' ? 'Voting hasn’t opened yet' : 'Voting is closed'} action={back} />
      </div>
    );
  }

  const left = dishes.filter((d) => d.authorId !== user.uid && !ratings.has(d.id)).length;
  const closes = toMillis(potluck.votingClosesAt);
  const done = potluck.scoring.filter((c) => scores[c.id]).length;
  const complete = done === potluck.scoring.length;
  const authorFirst = author?.displayName?.split(' ')[0] ?? 'this';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await submitRating(pid, did, scores);
      tapFeedback(ImpactStyle.Medium);
      toast('Rating submitted 🏆');
      // Go straight to the next unrated dish, if there is one.
      const nextDish = dishes.find((d) => d.authorId !== user.uid && !ratings.has(d.id) && d.id !== did);
      navigate(nextDish ? `/potlucks/${pid}/dishes/${nextDish.id}/rate` : `/feed/${pid}`, { replace: true });
      setScores({});
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Rate this dish" backTo={`/feed/${pid}`} actions={<Avatar uid={user.uid} profile={profile} size={40} />} />

      <div className="tile-peach p-3 mb-3 d-flex gap-3 align-items-center">
        <span className="rounded-circle bg-primary text-white d-grid flex-shrink-0 fs-5" style={{ width: 44, height: 44, placeItems: 'center' }}><i className="bi bi-trophy" /></span>
        <div>
          <div className="small text-primary fw-semibold">{potluck.title}</div>
          <div className="fw-bold">Rate {authorFirst === 'this' ? 'this' : `${authorFirst}’s`} dish before the challenge closes</div>
          <div className="small text-muted">{left} dish{left === 1 ? '' : 'es'} left{closes ? ` · closes in ${formatDuration(closes - now)}` : ''}</div>
        </div>
      </div>

      <div className="tile-lilac p-3 mb-3 d-flex gap-3 align-items-center">
        <div className="rounded-3 overflow-hidden flex-shrink-0" style={{ width: 96, height: 76 }}><FsImage src={dish.photo} alt={dish.name} /></div>
        <div className="min-w-0">
          <div className="fw-800 fs-5 text-truncate">{dish.name}</div>
          <div className="small text-muted">Made by {author?.displayName ?? '…'}</div>
          <div className="small text-danger">Your rating is <strong>anonymous</strong></div>
        </div>
      </div>

      <div className="d-grid gap-3 mb-3">
        {potluck.scoring.map((c) => (
          <div key={c.id} className="card-soft p-3">
            <div className="d-flex justify-content-between align-items-center">
              <h3 className="h5 fw-bold mb-0">{c.name}</h3>
              <span className={`chip ${scores[c.id] ? 'chip-green' : 'chip-peach'}`}>{scores[c.id] ?? 0} / 5</span>
            </div>
            <div className="small text-muted mb-2">{PROMPTS[c.name] ?? c.description}</div>
            <StarRating label={c.name} value={scores[c.id] ?? 0} onChange={(v) => setScores((s) => ({ ...s, [c.id]: v }))} />
            {scores[c.id] && <div className="small text-success fw-semibold mt-2"><i className="bi bi-check-lg" /> {scores[c.id]} of 5 selected</div>}
          </div>
        ))}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {complete
        ? <div className="tile-mint p-2 px-3 small mb-3"><i className="bi bi-check-circle me-1" />Ready to submit. All ratings are complete.</div>
        : <div className="small text-muted mb-3">Rate all {potluck.scoring.length} categories to submit. Votes are final.</div>}
      <div className="sticky-cta">
        <Button size="lg" className="w-100 shadow" disabled={!complete || busy} onClick={submit}>
          <i className="bi bi-trophy me-2" />{busy ? 'Submitting…' : 'Submit Rating'}
        </Button>
      </div>
    </div>
  );
}
