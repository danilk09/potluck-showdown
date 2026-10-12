import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useDishes, usePotluck } from '../hooks/useFirestore';
import { deleteDish, friendlyError, saveDish } from '../data/api';
import { COMMON_ALLERGENS, DIETARY_LABELS, formatInfo } from '../lib/formats';
import { phaseOf } from '../lib/phase';
import Avatar from '../components/Avatar';
import PhotoPicker from '../components/PhotoPicker';
import { ChipToggleGroup, EmptyState, Loading, PageHeader, useConfirm, useToast } from '../components/ui';

const blank = { name: '', categoryId: '', serves: '', ingredients: '', steps: '', allergens: [], dietary: [], prepMinutes: '', calories: '', photo: null, recipePhoto: null, usedRequired: false };

function fromDish(d) {
  return {
    ...blank,
    ...d,
    ingredients: (d.ingredients ?? []).join('\n'),
    prepMinutes: d.prepMinutes ?? '',
    calories: d.calories ?? '',
  };
}

export default function DishForm() {
  const { pid } = useParams();
  const { user } = useAuth();
  const { data: potluck, loading } = usePotluck(pid);
  const isMember = Boolean(potluck?.memberIds.includes(user.uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);

  if (loading || (isMember && dishesLoading)) return <Loading />;
  if (!potluck || !isMember) return <div className="page"><PageHeader title="Add your dish" /><EmptyState title="Join this potluck first" /></div>;
  if (phaseOf(potluck) !== 'open') {
    return (
      <div className="page">
        <PageHeader title="Add your dish" />
        <EmptyState emoji="🔒" title="Dishes are locked" action={<Button as={Link} to={`/potlucks/${pid}`}>Back to event</Button>}>
          Voting has started, so dishes can’t be added or changed anymore.
        </EmptyState>
      </div>
    );
  }
  const existing = dishes.find((d) => d.id === user.uid);
  return <DishEditor key={existing ? 'edit' : 'new'} potluck={potluck} dishes={dishes} existing={existing} />;
}

function DishEditor({ potluck, dishes, existing }) {
  const pid = potluck.id;
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [form, setForm] = useState(() => (existing ? fromDish(existing) : { ...blank }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [extraAllergen, setExtraAllergen] = useState('');

  const fmt = formatInfo(potluck.format);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key) => ({ value: form[key], onChange: (e) => set(key, e.target.value) });
  const counts = Object.fromEntries(potluck.dishCategories.map((c) => [c.id, dishes.filter((d) => d.categoryId === c.id && d.id !== user.uid).length]));
  const needsRequired = potluck.format === 'mystery' && potluck.formatDetail;

  const missing = [
    !form.name.trim() && 'dish name',
    !form.categoryId && 'category',
    !form.ingredients.trim() && 'ingredients',
    needsRequired && !form.usedRequired && 'required-ingredient check',
  ].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) return setError(`Please add: ${missing.join(', ')}.`);
    setBusy(true);
    setError('');
    try {
      await saveDish(pid, form, existing);
      toast(existing ? 'Dish updated' : 'Dish added! 🎉');
      navigate(`/potlucks/${pid}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
    return undefined;
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Remove your dish?', body: 'This frees up your spot so you can pick a different dish.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await deleteDish(pid, existing);
      toast('Dish removed');
      navigate(`/potlucks/${pid}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const addAllergen = () => {
    const a = extraAllergen.trim();
    if (a && !form.allergens.includes(a)) set('allergens', [...form.allergens, a]);
    setExtraAllergen('');
  };

  return (
    <div className="page">
      {confirmEl}
      <PageHeader title={existing ? 'Edit your dish' : 'Add your dish'} actions={<Avatar uid={user.uid} profile={profile} size={40} />} />

      <div className="tile-peach p-3 mb-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="rounded-circle bg-primary text-white d-grid fw-bold flex-shrink-0" style={{ width: 34, height: 34, placeItems: 'center' }}>{fmt.emoji}</span>
          <div className="min-w-0">
            <div className="fw-bold text-truncate">{potluck.title}</div>
            <div className="small text-muted">{fmt.blurb} Voters judge:</div>
          </div>
        </div>
        <Row className="g-2">
          {potluck.scoring.map((c) => (
            <Col xs={6} key={c.id}>
              <div className="bg-white rounded-3 p-2 h-100">
                <div className="small text-muted">{c.name} · {c.weight}%</div>
                <div className="fw-semibold small">{c.description}</div>
              </div>
            </Col>
          ))}
        </Row>
        {potluck.formatDetail && <div className="small mt-2"><strong>{fmt.detailLabel}:</strong> {potluck.formatDetail}</div>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={submit} className="d-grid gap-3" noValidate>
        <Form.Group controlId="name">
          <Form.Label>Dish name</Form.Label>
          <Form.Control {...field('name')} maxLength={80} placeholder="Spicy sesame noodles" required />
        </Form.Group>
        <Row className="g-3">
          <Col xs={7}>
            <Form.Group controlId="category">
              <Form.Label>{potluck.format === 'courses' ? 'Bracket' : 'Category'}</Form.Label>
              <Form.Select {...field('categoryId')} required>
                <option value="">Choose…</option>
                {potluck.dishCategories.map((c) => {
                  const left = c.needed - counts[c.id];
                  return <option key={c.id} value={c.id}>{c.name}{left > 0 ? ` (${left} needed)` : ' (full)'}</option>;
                })}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col xs={5}>
            <Form.Group controlId="serves">
              <Form.Label>Serves</Form.Label>
              <Form.Control {...field('serves')} maxLength={40} placeholder="8–10 people" />
            </Form.Group>
          </Col>
        </Row>

        <PhotoPicker title="Add a photo of your dish" current={form.photo} pending={form.photoData} onPick={(d) => set('photoData', d)} onRemove={() => setForm((f) => ({ ...f, photo: null, photoData: null }))} />

        <Form.Group controlId="ingredients">
          <Form.Label>Ingredients</Form.Label>
          <Form.Control as="textarea" rows={4} {...field('ingredients')} placeholder={'One per line, or separated by commas\n8 oz wheat noodles\n2 tbsp sesame paste'} />
        </Form.Group>
        {needsRequired && (
          <Form.Check
            id="usedRequired"
            type="checkbox"
            className="tile-gold p-3 ps-5"
            checked={form.usedRequired}
            onChange={(e) => set('usedRequired', e.target.checked)}
            label={<>My dish uses every required ingredient: <strong>{potluck.formatDetail}</strong></>}
          />
        )}

        <Form.Group controlId="steps">
          <Form.Label className="mb-0">Recipe</Form.Label>
          <Form.Text className="d-block mb-1">Type or paste the steps. Guests can find this in their recipe bank later.</Form.Text>
          <Form.Control as="textarea" rows={5} {...field('steps')} maxLength={8000} placeholder="1. Boil the noodles…" />
        </Form.Group>
        <PhotoPicker compact title="Or upload a photo of a recipe card" current={form.recipePhoto} pending={form.recipePhotoData} onPick={(d) => set('recipePhotoData', d)} onRemove={() => setForm((f) => ({ ...f, recipePhoto: null, recipePhotoData: null }))} />

        <Row className="g-3">
          <Col xs={6}>
            <Form.Group controlId="prep">
              <Form.Label>Prep time (min)</Form.Label>
              <Form.Control type="number" inputMode="numeric" min={0} {...field('prepMinutes')} placeholder="30" />
            </Form.Group>
          </Col>
          <Col xs={6}>
            <Form.Group controlId="calories">
              <Form.Label>Calories / serving</Form.Label>
              <Form.Control type="number" inputMode="numeric" min={0} {...field('calories')} placeholder="Optional" />
            </Form.Group>
          </Col>
        </Row>

        <div>
          <Form.Label>Allergens</Form.Label>
          <ChipToggleGroup warn ariaLabel="Allergens" options={[...new Set([...COMMON_ALLERGENS, ...form.allergens])]} value={form.allergens} onChange={(v) => set('allergens', v)} />
          <div className="d-flex gap-2 mt-2" style={{ maxWidth: 320 }}>
            <Form.Control size="sm" aria-label="Other allergen" placeholder="Other allergen" value={extraAllergen} onChange={(e) => setExtraAllergen(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllergen(); } }} />
            <Button size="sm" variant="outline-primary" onClick={addAllergen}>Add</Button>
          </div>
        </div>
        <div>
          <Form.Label>Dietary labels</Form.Label>
          <ChipToggleGroup ariaLabel="Dietary labels" options={DIETARY_LABELS} value={form.dietary} onChange={(v) => set('dietary', v)} />
        </div>

        <div className="card-soft p-3">
          <div className="fw-bold mb-2">Challenge tips</div>
          <ul className="small text-muted mb-0 list-plain">
            <li>Choose whole ingredients, fresh flavors, and easy-to-share portions.</li>
            <li>Highlight healthy swaps, seasonal picks, and allergen-friendly choices.</li>
            <li>A clear photo helps people imagine the dish before tasting.</li>
          </ul>
        </div>

        {missing.length === 0
          ? <div className="tile-mint p-2 px-3 small"><i className="bi bi-check-lg me-1" />All required details are complete.</div>
          : <div className="small text-muted">Still needed: {missing.join(', ')}.</div>}

        <div className="sticky-cta d-grid gap-2">
          <Button type="submit" size="lg" className="shadow" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save Dish' : 'Add Dish'}</Button>
        </div>
        {existing && <Button variant="link" className="text-danger" onClick={remove}>Remove my dish</Button>}
      </Form>
    </div>
  );
}
