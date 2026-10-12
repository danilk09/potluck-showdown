import { Link, useParams } from 'react-router';
import { Button, ProgressBar } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useDocData, useMyRatings, usePotluck } from '../hooks/useFirestore';
import { friendlyError, toggleLike } from '../data/api';
import { phaseOf } from '../lib/phase';
import { categoryAverage, overallScore } from '../lib/scoring';
import { formatDate } from '../lib/dates';
import { shareLink, tapFeedback } from '../lib/platform';
import { AuthorLine } from '../components/Avatar';
import { EmptyState, FsImage, Loading, PageHeader, Stars, useToast } from '../components/ui';

export default function DishDetail() {
  const { pid, did } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: potluck, loading } = usePotluck(pid);
  const isMember = Boolean(potluck?.memberIds.includes(user.uid));
  const { data: dish, loading: dishLoading, error } = useDocData(isMember ? `potlucks/${pid}/dishes/${did}` : null);
  const { ratings } = useMyRatings(pid, isMember);

  if (loading || (isMember && dishLoading)) return <Loading />;
  if (!potluck || !isMember || !dish || error) {
    return (
      <div className="page">
        <PageHeader title="Recipe" />
        <EmptyState emoji="🔒" title="Recipe unavailable">Recipes are only visible to people who attended that potluck.</EmptyState>
      </div>
    );
  }

  const phase = phaseOf(potluck);
  const mine = dish.authorId === user.uid;
  const myRating = ratings.get(dish.id);
  const liked = dish.likedBy?.includes(user.uid);
  const category = potluck.dishCategories.find((c) => c.id === dish.categoryId);
  const overall = overallScore(dish, potluck.scoring);

  const like = async () => {
    tapFeedback();
    try {
      await toggleLike(pid, dish.id, liked);
    } catch (err) {
      toast(friendlyError(err), 'danger');
    }
  };

  // Sharing text only. Recipes stay private to attendees, so no link is shared.
  const share = async () => {
    const text = `${dish.name}\n\nIngredients:\n${dish.ingredients.map((i) => `• ${i}`).join('\n')}${dish.steps ? `\n\nSteps:\n${dish.steps}` : ''}`;
    const res = await shareLink({ title: dish.name, text });
    if (res === 'copied') toast('Recipe copied');
  };

  return (
    <div className="page">
      <PageHeader
        title="Recipe"
        actions={<Button variant="link" className="text-primary fs-5 p-1" onClick={share} aria-label="Share recipe"><i className="bi bi-share" /></Button>}
      />
      <div className="card-soft overflow-hidden mb-3">
        <div style={{ aspectRatio: '16 / 10' }}><FsImage src={dish.photo} alt={dish.name} /></div>
        <div className="p-3">
          <div className="d-flex gap-2 flex-wrap mb-2">
            {category && <span className="chip chip-peach">{category.name}</span>}
            {dish.dietary?.map((d) => <span key={d} className="chip chip-green">{d}</span>)}
          </div>
          <h2 className="fw-800 mb-2">{dish.name}</h2>
          <div className="d-flex justify-content-between align-items-center gap-2">
            <AuthorLine uid={dish.authorId} sub={`${potluck.title} · ${formatDate(potluck.startsAt)}`} />
            <button type="button" className={`btn btn-sm ${liked ? 'text-primary' : 'text-muted'}`} onClick={like} aria-pressed={liked}>
              <i className={`bi bi-heart${liked ? '-fill' : ''} me-1`} />{dish.likedBy?.length ?? 0}
            </button>
          </div>
        </div>
        <div className="d-flex border-top text-center small">
          {[
            ['Serves', dish.serves || '—'],
            ['Prep', dish.prepMinutes != null ? `${dish.prepMinutes} min` : '—'],
            ['Calories', dish.calories != null ? `${dish.calories} kcal` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex-fill p-2 border-end"><div className="text-muted">{label}</div><div className="fw-bold">{value}</div></div>
          ))}
        </div>
      </div>

      {phase === 'voting' && !mine && (
        myRating
          ? <div className="tile-mint p-3 mb-3"><i className="bi bi-check-circle me-2" />You rated this dish. Thanks!</div>
          : <Button as={Link} to={`/potlucks/${pid}/dishes/${did}/rate`} size="lg" className="w-100 mb-3"><i className="bi bi-star-fill me-2" />Rate this dish</Button>
      )}
      {mine && phase === 'open' && <Button as={Link} to={`/potlucks/${pid}/dish`} variant="outline-primary" className="w-100 mb-3">Edit my dish</Button>}

      {phase === 'closed' && (
        <div className="card-soft p-3 mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h3 className="h6 fw-bold mb-0">Final score</h3>
            <Stars value={overall} />
          </div>
          {potluck.scoring.map((c) => {
            const avg = categoryAverage(dish, c.id);
            return (
              <div key={c.id} className="mb-2">
                <div className="d-flex justify-content-between small"><span>{c.name}</span><span className="fw-bold">{avg != null ? avg.toFixed(1) : '—'}</span></div>
                <ProgressBar now={avg ? (avg / 5) * 100 : 0} variant="warning" style={{ height: 8 }} />
              </div>
            );
          })}
          <div className="small text-muted">{dish.ratingCount} vote{dish.ratingCount === 1 ? '' : 's'}{myRating ? ` · you gave ${Object.values(myRating.scores).join(' / ')}` : ''}</div>
        </div>
      )}

      {dish.allergens?.length > 0 && (
        <div className="tile-gold p-3 mb-3"><i className="bi bi-exclamation-triangle me-2" /><strong>Contains:</strong> {dish.allergens.join(', ')}</div>
      )}

      <div className="card-soft p-3 mb-3">
        <h3 className="h6 fw-bold">Ingredients</h3>
        <ul className="list-plain mb-0">{dish.ingredients.map((i, n) => <li key={n}>{i}</li>)}</ul>
      </div>

      <div className="card-soft p-3 mb-3">
        <h3 className="h6 fw-bold">Recipe</h3>
        {dish.steps ? <div className="recipe-steps">{dish.steps}</div> : <div className="text-muted small">No written steps were added.</div>}
        {dish.recipePhoto && <div className="mt-3 rounded-3 overflow-hidden"><FsImage src={dish.recipePhoto} alt="Recipe card" className="w-100" fallback="📄" /></div>}
      </div>
    </div>
  );
}
