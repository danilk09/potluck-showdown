import { Link, useNavigate } from 'react-router';
import { Button, Col, Row } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useMyPotlucks, useNow } from '../hooks/useFirestore';
import Avatar from '../components/Avatar';
import PotluckCard from '../components/PotluckCard';
import { EmptyState, Loading } from '../components/ui';
import { GetAppBanner } from '../components/Layout';
import { phaseOf } from '../lib/phase';
import { toMillis } from '../lib/scoring';

const TIPS = [
  'Claim a dish early and become everyone’s favorite guest.',
  'Healthy swaps count: healthiness is part of the score.',
  'Add your recipe so guests can recreate your dish later.',
  'A clear photo helps people find your dish in the feed.',
];

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const { data: potlucks, loading } = useMyPotlucks();

  const live = potlucks.filter((p) => phaseOf(p, now) === 'voting');
  // "Upcoming" = not finished and not more than a day in the past.
  const upcoming = potlucks.filter((p) => p.status !== 'closed' && toMillis(p.startsAt) > now - 86_400_000);
  const tip = TIPS[new Date(now).getDate() % TIPS.length];

  return (
    <div className="page">
      <div className="d-flex justify-content-between align-items-center mb-3 d-md-none">
        <span className="fs-5 fw-800">Potluck Showdown</span>
        <Link to="/profile" aria-label="Your profile"><Avatar uid={user.uid} profile={profile} size={44} /></Link>
      </div>
      <GetAppBanner />

      <h1 className="fw-800 mb-2">Make your Potluck more fun</h1>
      <p className="text-muted mb-3">Join a potluck, share what you bring, and compete for favorites based on taste and healthiness.</p>
      <Row className="g-2 mb-4">
        <Col><Button className="w-100 py-3 text-nowrap" onClick={() => navigate('/create')}><i className="bi bi-plus-lg me-1" />Create Potluck</Button></Col>
        <Col><Button variant="outline-primary" className="w-100 py-3 text-nowrap" onClick={() => navigate('/join')}>Join Potluck</Button></Col>
      </Row>

      {live.map((p) => (
        <Link key={p.id} to={`/feed/${p.id}`} className="tile-gold d-flex align-items-center gap-3 p-3 mb-3 text-body">
          <span className="fs-3" aria-hidden>🗳️</span>
          <span className="flex-grow-1"><strong>Voting is open</strong> at {p.title}. Rate the dishes!</span>
          <i className="bi bi-chevron-right" />
        </Link>
      ))}

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h5 fw-bold mb-0">Upcoming potlucks</h2>
        <Link to="/events" className="fw-semibold">See all</Link>
      </div>

      {loading ? <Loading /> : upcoming.length === 0 ? (
        <EmptyState emoji="🥘" title={potlucks.length ? 'Nothing coming up' : 'No potlucks yet'} action={<Button onClick={() => navigate('/join')}>Enter an invite code</Button>}>
          {potlucks.length ? 'Your past showdowns are under Events. ' : ''}Create your own showdown, or join one with an invite code from a friend.
        </EmptyState>
      ) : (
        <div className="d-grid gap-3">
          {upcoming.slice(0, 4).map((p) => <PotluckCard key={p.id} potluck={p} now={now} />)}
        </div>
      )}

      <div className="tile-lilac d-flex align-items-center gap-3 p-3 mt-4">
        <i className="bi bi-star text-primary fs-4" />
        <span>{tip}</span>
      </div>
    </div>
  );
}
