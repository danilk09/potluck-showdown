import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Collapse } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useDishes, usePotluck } from '../hooks/useFirestore';
import { useProfiles } from '../hooks/useProfiles';
import { bracketWinners, categoryAwards, rankDishes, resultsSummary } from '../lib/scoring';
import { FRAMES, FRAME_ORDER } from '../lib/frames';
import { formatDate } from '../lib/dates';
import { shareLink } from '../lib/platform';
import { EmptyState, FsImage, Loading, PageHeader, Stars, useToast } from '../components/ui';
import Avatar from '../components/Avatar';

export default function Results() {
  const { pid } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const { data: potluck, loading } = usePotluck(pid);
  const isMember = Boolean(potluck?.memberIds.includes(user.uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);
  const ranked = useMemo(() => (potluck ? rankDishes(dishes, potluck.scoring) : []), [dishes, potluck]);
  const lookup = useProfiles(ranked.map((d) => d.authorId));

  if (loading || (isMember && dishesLoading)) return <Loading />;
  if (!potluck || !isMember) return <div className="page"><PageHeader title="Results" /><EmptyState title="Results unavailable" emoji="🔒" /></div>;
  if (potluck.status !== 'closed') {
    return (
      <div className="page">
        <PageHeader title="Potluck Competition" />
        <EmptyState emoji="⏳" title="Results aren’t in yet" action={<Button as={Link} to={`/potlucks/${pid}`}>Back to event</Button>}>
          The leaderboard appears once the host closes voting and publishes the results.
        </EmptyState>
      </div>
    );
  }

  const summary = potluck.results ?? resultsSummary(ranked, potluck.memberIds.length);
  const top = ranked.filter((d) => d.overall != null).slice(0, 3);
  const awards = categoryAwards(ranked, potluck.scoring);
  const brackets = potluck.dishCategories.length > 1 ? bracketWinners(ranked, potluck.dishCategories) : [];
  const myPlace = (potluck.podium ?? []).indexOf(user.uid);
  const name = (uid) => lookup(uid)?.displayName ?? 'Former guest';

  const share = async () => {
    const lines = top.map((d, i) => `${['🥇', '🥈', '🥉'][i]} ${d.name} by ${name(d.authorId)} (${d.overall.toFixed(1)}/5)`);
    const res = await shareLink({ title: `${potluck.title} results`, text: `🍲 ${potluck.title}: the votes are in!\n${lines.join('\n')}\n\nMade with Potluck Showdown` });
    if (res === 'copied') toast('Results copied');
  };

  return (
    <div className="page">
      <PageHeader title="Potluck Competition" backTo={`/potlucks/${pid}`} actions={<Button variant="link" className="fw-bold" onClick={share}>Share</Button>} />

      <div className="text-center mb-3">
        <div className="confetti" aria-hidden>🎉</div>
        <h2 className="fw-800 mb-1">Plates cleared. Votes counted.</h2>
        <div className="text-muted">{potluck.title} · {formatDate(potluck.startsAt)}</div>
      </div>

      {myPlace >= 0 && (
        <Link to="/profile" className="tile-gold d-flex align-items-center gap-3 p-3 mb-3 text-body">
          <span className="fs-2" aria-hidden>{FRAMES[FRAME_ORDER[myPlace]].medal}</span>
          <span className="flex-grow-1"><strong>You placed #{myPlace + 1}!</strong> Your {FRAMES[FRAME_ORDER[myPlace]].label} frame is unlocked. Wear it on your profile picture.</span>
          <i className="bi bi-chevron-right" />
        </Link>
      )}

      <div className="card-soft p-3 mb-4">
        <div className="small-caps text-primary mb-2">Final scores</div>
        {[
          ['Total votes', summary.totalVotes],
          ['Average rating', `${summary.averageRating}/5`],
          ['Winning rating', `${summary.winningRating}/5`],
        ].map(([label, value]) => (
          <div key={label} className="d-flex justify-content-between align-items-baseline py-1">
            <span className="text-muted">{label}</span><span className="fs-4 fw-800">{value}</span>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h3 className="h4 fw-800 mb-0">Leaderboard</h3>
        <span className="small-caps text-primary">Top {top.length}</span>
      </div>
      {top.length === 0 ? <EmptyState emoji="🤷" title="No votes were cast" /> : (
        <div className="d-grid gap-2 mb-3">
          {top.map((d, i) => (
            <Link key={d.id} to={`/potlucks/${pid}/dishes/${d.id}`} className={`podium-row place-${i + 1} text-body`}>
              <span className="rank">{i + 1}</span>
              <span className="thumb"><FsImage src={d.photo} alt="" /></span>
              <span className="flex-grow-1 min-w-0">
                <span className="fw-800 d-block text-truncate">{d.name}</span>
                <span className="small d-flex align-items-center gap-1 text-truncate">
                  <Avatar uid={d.authorId} profile={lookup(d.authorId)} size={22} medal={false} /> by {name(d.authorId)}
                </span>
              </span>
              <Stars value={d.overall} className="small" />
            </Link>
          ))}
        </div>
      )}

      {ranked.length > 3 && (
        <>
          <Button variant="link" className="px-0 fw-semibold mb-2" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
            {showAll ? 'Hide' : 'Show'} full ranking <i className={`bi bi-chevron-${showAll ? 'up' : 'down'}`} />
          </Button>
          <Collapse in={showAll}>
            <div>
              <div className="card-soft p-2 mb-3">
                {ranked.slice(3).map((d, i) => (
                  <Link key={d.id} to={`/potlucks/${pid}/dishes/${d.id}`} className="d-flex align-items-center gap-2 p-2 text-body">
                    <span className="text-muted fw-bold" style={{ width: 24 }}>{i + 4}</span>
                    <span className="flex-grow-1 text-truncate">{d.name} <span className="text-muted small">by {name(d.authorId)}</span></span>
                    <Stars value={d.overall} className="small" />
                  </Link>
                ))}
              </div>
            </div>
          </Collapse>
        </>
      )}

      {(awards.length > 0 || brackets.length > 0) && (
        <>
          <h3 className="h5 fw-800 mt-2 mb-2">Category champions</h3>
          <div className="row g-2 mb-3">
            {awards.map((a) => (
              <div className="col-6" key={a.category.id}>
                <Link to={`/potlucks/${pid}/dishes/${a.dish.id}`} className="card-soft p-3 d-block h-100 text-body">
                  <div className="small-caps text-primary">Top {a.category.name}</div>
                  <div className="fw-bold text-truncate">{a.dish.name}</div>
                  <div className="small text-muted text-truncate">{name(a.dish.authorId)} · {a.avg.toFixed(1)}/5</div>
                </Link>
              </div>
            ))}
            {brackets.map((b) => (
              <div className="col-6" key={b.category.id}>
                <Link to={`/potlucks/${pid}/dishes/${b.dish.id}`} className="card-soft p-3 d-block h-100 text-body">
                  <div className="small-caps text-success">Best {b.category.name}</div>
                  <div className="fw-bold text-truncate">{b.dish.name}</div>
                  <div className="small text-muted text-truncate">{name(b.dish.authorId)} · {b.dish.overall.toFixed(1)}/5</div>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card-soft d-flex justify-content-around text-muted small p-2 mb-3">
        <span>{summary.guestCount} guests</span><span>{summary.dishCount} dishes</span><span>{summary.totalVotes} ratings</span>
      </div>
      <Button size="lg" className="w-100 btn-soft" onClick={share}>Share the results</Button>
    </div>
  );
}
