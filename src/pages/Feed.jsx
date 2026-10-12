import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Button, Col, Dropdown, Row } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useDishes, useMyPotlucks, useMyRatings, useNow } from '../hooks/useFirestore';
import { friendlyError, toggleLike } from '../data/api';
import { PHASE_CHIP, PHASE_LABEL, phaseOf } from '../lib/phase';
import { rankDishes, toMillis } from '../lib/scoring';
import { tapFeedback } from '../lib/platform';
import { AuthorLine } from '../components/Avatar';
import { EmptyState, FsImage, Loading, Stars, useToast } from '../components/ui';

/** Picks the potluck people most likely want: live voting, then the next one, then the latest. */
export function defaultPotluck(potlucks, now = Date.now()) {
  const byPhase = (ph) => potlucks.filter((p) => phaseOf(p, now) === ph);
  return byPhase('voting')[0]
    ?? byPhase('open').sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt))[0]
    ?? [...potlucks].sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt))[0];
}

function DishCard({ dish, potluck, phase, rated, onLike }) {
  const { user } = useAuth();
  const mine = dish.authorId === user.uid;
  const liked = dish.likedBy?.includes(user.uid);
  const category = potluck.dishCategories.find((c) => c.id === dish.categoryId);
  const detail = `/potlucks/${potluck.id}/dishes/${dish.id}`;
  return (
    <article className="card-soft dish-card h-100 d-flex flex-column">
      <div className="d-flex align-items-center justify-content-between p-3 pb-2">
        <AuthorLine uid={dish.authorId} sub={category?.name} />
        <Dropdown align="end">
          <Dropdown.Toggle variant="link" className="text-body p-1 no-caret" aria-label="Dish options"><i className="bi bi-three-dots fs-5" /></Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item as={Link} to={detail}><i className="bi bi-journal-text me-2" />View recipe</Dropdown.Item>
            {mine && phase === 'open' && <Dropdown.Item as={Link} to={`/potlucks/${potluck.id}/dish`}><i className="bi bi-pencil me-2" />Edit my dish</Dropdown.Item>}
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <Link to={detail} className="dish-photo d-block" aria-label={dish.name}>
        <FsImage src={dish.photo} alt={dish.name} />
      </Link>
      <div className="p-3 d-flex flex-column gap-2 flex-grow-1">
        <h3><Link to={detail} className="text-body">{dish.name}</Link></h3>
        <div className="d-flex align-items-center justify-content-between gap-2">
          <button type="button" className={`btn btn-sm px-1 ${liked ? 'text-primary' : 'text-muted'}`} onClick={() => onLike(dish, liked)} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
            <i className={`bi bi-heart${liked ? '-fill' : ''} me-1`} />{dish.likedBy?.length ?? 0}
          </button>
          {phase === 'closed' ? <Stars value={dish.overall} />
            : mine ? <span className="chip chip-plain">Your dish</span>
              : phase === 'voting' ? (rated
                ? <span className="chip chip-green"><i className="bi bi-check-lg" />Rated</span>
                : <Button as={Link} to={`${detail}/rate`} size="sm" variant="soft" className="btn-soft rounded-pill"><i className="bi bi-star-fill me-1" />Rate Dish</Button>)
                : null}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center small text-muted mt-auto">
          <Link to={detail} className="chip chip-peach">Recipe</Link>
          {dish.prepMinutes != null && <span>{dish.prepMinutes} min</span>}
          {dish.calories != null && <span>· {dish.calories} kcal</span>}
          {dish.dietary?.slice(0, 2).map((d) => <span key={d}>· {d.toLowerCase()}</span>)}
        </div>
      </div>
    </article>
  );
}

export default function Feed() {
  const { pid } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const { data: potlucks, loading } = useMyPotlucks();
  const potluck = potlucks.find((p) => p.id === pid);
  const { data: dishes, loading: dishesLoading } = useDishes(potluck?.id, Boolean(potluck));
  const { ratings } = useMyRatings(potluck?.id, Boolean(potluck));
  const phase = phaseOf(potluck, now);

  const sorted = useMemo(() => {
    if (!potluck) return [];
    if (phase === 'closed') return rankDishes(dishes, potluck.scoring);
    return [...dishes].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [dishes, potluck, phase]);

  if (loading) return <Loading />;
  if (!pid) {
    const def = defaultPotluck(potlucks, now);
    if (def) return <Navigate to={`/feed/${def.id}`} replace />;
  }

  const onLike = async (dish, liked) => {
    tapFeedback();
    try {
      await toggleLike(potluck.id, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  return (
    <div className="page-wide">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h1 className="h3 fw-800 text-uppercase mb-0">Food Feed</h1>
        {potlucks.length > 0 && (
          <Dropdown align="end">
            <Dropdown.Toggle variant="link" className="fw-bold text-primary text-decoration-none px-0 text-truncate" style={{ maxWidth: '55vw' }}>
              {potluck?.title ?? 'Choose potluck'}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {potlucks.map((p) => (
                <Dropdown.Item key={p.id} active={p.id === pid} onClick={() => navigate(`/feed/${p.id}`, { replace: true })}>
                  {p.title} <span className="small text-muted">· {PHASE_LABEL[phaseOf(p, now)]}</span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>

      {!potluck ? (
        <EmptyState emoji="📸" title="Nothing on the menu yet" action={<Button onClick={() => navigate('/join')}>Join a potluck</Button>}>
          {pid ? 'You’re not part of that potluck.' : 'Dishes from your potlucks show up here.'}
        </EmptyState>
      ) : (
        <>
          <div className="d-flex align-items-center gap-2 mb-3">
            <span className={`chip ${PHASE_CHIP[phase]}`}>{PHASE_LABEL[phase]}</span>
            <Link to={`/potlucks/${potluck.id}`} className="small fw-semibold">Event details</Link>
            {phase === 'closed' && <Link to={`/potlucks/${potluck.id}/results`} className="small fw-semibold ms-auto">Leaderboard <i className="bi bi-chevron-right" /></Link>}
          </div>
          {dishesLoading ? <Loading /> : sorted.length === 0 ? (
            <EmptyState emoji="🍽️" title="No dishes yet" action={phase === 'open' && <Button as={Link} to={`/potlucks/${potluck.id}/dish`}>Add your dish</Button>}>
              Be the first to share what you’re bringing.
            </EmptyState>
          ) : (
            <Row xs={1} md={2} xl={3} className="g-3">
              {sorted.map((d) => (
                <Col key={d.id}>
                  <DishCard dish={d} potluck={potluck} phase={phase} rated={ratings.has(d.id)} onLike={onLike} />
                </Col>
              ))}
            </Row>
          )}
        </>
      )}
    </div>
  );
}
