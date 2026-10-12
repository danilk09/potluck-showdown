import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { useMyPotlucks } from '../hooks/useFirestore';
import { useProfiles } from '../hooks/useProfiles';
import { friendlyError, loadRecipeBank } from '../data/api';
import { DIETARY_LABELS } from '../lib/formats';
import { overallScore, toMillis } from '../lib/scoring';
import { formatDate } from '../lib/dates';
import { ChipToggleGroup, EmptyState, FsImage, Loading, PageHeader, Stars } from '../components/ui';

/**
 * The recipe bank: every dish from every potluck the user attended. Firestore
 * rules make dishes readable only by that potluck's members, so this list can
 * never include recipes from events the user wasn't part of.
 */
export default function RecipeBank() {
  const { data: potlucks, loading } = useMyPotlucks();
  const [recipes, setRecipes] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [potluckFilter, setPotluckFilter] = useState('');
  const [dietary, setDietary] = useState([]);
  const [sort, setSort] = useState('recent');
  const lookup = useProfiles(recipes?.map((r) => r.authorId) ?? []);
  const potluckKey = potlucks.map((p) => p.id).join(',');

  useEffect(() => {
    if (loading) return undefined;
    let alive = true;
    loadRecipeBank(potlucks)
      .then((r) => alive && setRecipes(r))
      .catch((err) => alive && setError(friendlyError(err)));
    return () => { alive = false; };
    // Reload when the set of potlucks changes, not on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, potluckKey]);

  const results = useMemo(() => {
    if (!recipes) return [];
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return recipes
      .map((r) => ({ ...r, overall: overallScore(r, r.potluck.scoring) }))
      .filter((r) => !potluckFilter || r.potluck.id === potluckFilter)
      .filter((r) => dietary.every((d) => r.dietary?.includes(d)))
      .filter((r) => {
        if (!terms.length) return true;
        const haystack = [
          r.name, r.steps, r.potluck.title, r.potluck.theme, lookup(r.authorId)?.displayName,
          ...(r.ingredients ?? []), ...(r.dietary ?? []),
          r.potluck.dishCategories.find((c) => c.id === r.categoryId)?.name,
        ].join(' ').toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .sort((a, b) => {
        if (sort === 'top') return (b.overall ?? -1) - (a.overall ?? -1);
        if (sort === 'liked') return (b.likedBy?.length ?? 0) - (a.likedBy?.length ?? 0);
        if (sort === 'az') return a.name.localeCompare(b.name);
        return toMillis(b.potluck.startsAt) - toMillis(a.potluck.startsAt);
      });
  }, [recipes, search, potluckFilter, dietary, sort, lookup]);

  const filtered = search || potluckFilter || dietary.length;

  return (
    <div className="page-wide">
      <PageHeader title="Recipe bank" back={false} />
      <p className="text-muted">Recipes from every potluck you’ve attended, ready to recreate.</p>

      <Form.Control
        type="search"
        className="search-input mb-2"
        placeholder="Search dishes, ingredients, people…"
        aria-label="Search recipes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Row className="g-2 mb-2">
        <Col xs={7} sm="auto">
          <Form.Select size="sm" aria-label="Filter by potluck" value={potluckFilter} onChange={(e) => setPotluckFilter(e.target.value)}>
            <option value="">All potlucks</option>
            {potlucks.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Form.Select>
        </Col>
        <Col xs={5} sm="auto">
          <Form.Select size="sm" aria-label="Sort recipes" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Newest</option>
            <option value="top">Top rated</option>
            <option value="liked">Most liked</option>
            <option value="az">A–Z</option>
          </Form.Select>
        </Col>
      </Row>
      <div className="mb-3 overflow-auto pb-1">
        <ChipToggleGroup ariaLabel="Dietary filters" options={DIETARY_LABELS.slice(0, 6)} value={dietary} onChange={setDietary} />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {loading || (!recipes && !error) ? <Loading label="Gathering your recipes…" /> : results.length === 0 ? (
        <EmptyState emoji={filtered ? '🔍' : '📖'} title={filtered ? 'No matching recipes' : 'Your recipe bank is empty'}
          action={filtered ? <Button variant="outline-primary" onClick={() => { setSearch(''); setPotluckFilter(''); setDietary([]); }}>Clear filters</Button> : null}>
          {filtered ? 'Try a different search or filter.' : 'Join a potluck and recipes from it will collect here.'}
        </EmptyState>
      ) : (
        <>
          <div className="small text-muted mb-2">{results.length} recipe{results.length === 1 ? '' : 's'}</div>
          <Row xs={1} md={2} xl={3} className="g-3">
            {results.map((r) => (
              <Col key={`${r.potluck.id}/${r.id}`}>
                <Link to={`/potlucks/${r.potluck.id}/dishes/${r.id}`} className="card-soft d-flex gap-3 p-2 text-body h-100">
                  <div className="rounded-3 overflow-hidden flex-shrink-0" style={{ width: 92, height: 92 }}><FsImage src={r.photo} alt="" /></div>
                  <div className="min-w-0 py-1 flex-grow-1">
                    <div className="fw-bold text-truncate">{r.name}</div>
                    <div className="small text-muted text-truncate">by {lookup(r.authorId)?.displayName ?? '…'}</div>
                    <div className="small text-primary text-truncate">{r.potluck.title} · {formatDate(r.potluck.startsAt)}</div>
                    <div className="small d-flex gap-2 align-items-center mt-1">
                      {r.potluck.status === 'closed' && <Stars value={r.overall} />}
                      {r.dietary?.[0] && <span className="chip chip-green">{r.dietary[0]}</span>}
                    </div>
                  </div>
                </Link>
              </Col>
            ))}
          </Row>
        </>
      )}
    </div>
  );
}
