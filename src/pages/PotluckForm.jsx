import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert, Button, Col, Dropdown, Form, InputGroup, Row } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { usePotluck } from '../hooks/useFirestore';
import { createPotluck, friendlyError, updatePotluck } from '../data/api';
import { DEFAULT_SCORING, FORMATS, FORMAT_KEYS, MAX_SCORING, SCORING_SUGGESTIONS, formatInfo } from '../lib/formats';
import { generateInviteCode, isValidInviteCode, normalizeInviteCode } from '../lib/inviteCode';
import { weightsTotal } from '../lib/scoring';
import { phaseOf } from '../lib/phase';
import { toInputDate, toInputDateTime, toInputTime } from '../lib/dates';
import { EmptyState, Loading, PageHeader, useToast } from '../components/ui';
import PhotoPicker from '../components/PhotoPicker';

const DRAFT_KEY = 'ps-potluck-draft';
const newId = () => `k${Math.random().toString(36).slice(2, 8)}`;
const categoriesFor = (format) => formatInfo(format).defaultCategories.map((name) => ({ id: newId(), name, needed: 3 }));

function blankForm() {
  return {
    title: '', date: '', time: '18:30', location: '', format: 'classic', formatDetail: '', theme: '', description: '',
    inviteCode: generateInviteCode(), scoring: DEFAULT_SCORING.map((c) => ({ ...c })), dishCategories: categoriesFor('classic'),
    maxGuests: '', votingOpensAt: '', votingClosesAt: '', coverImage: null, coverData: null,
  };
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return d ? { ...blankForm(), ...d, inviteCode: d.inviteCode || generateInviteCode(d.title) } : null;
  } catch {
    return null;
  }
}

function fromPotluck(p) {
  return {
    title: p.title, date: toInputDate(p.startsAt), time: toInputTime(p.startsAt), location: p.location ?? '',
    format: p.format, formatDetail: p.formatDetail ?? '', theme: p.theme ?? '', description: p.description ?? '',
    inviteCode: p.inviteCode, scoring: p.scoring.map((c) => ({ ...c })), dishCategories: p.dishCategories.map((c) => ({ ...c })),
    maxGuests: p.maxGuests || '', votingOpensAt: toInputDateTime(p.votingOpensAt), votingClosesAt: toInputDateTime(p.votingClosesAt),
    coverImage: p.coverImage ?? null, coverData: null,
  };
}

export default function PotluckForm() {
  const { pid } = useParams();
  const editing = Boolean(pid);
  const { data: existing, loading } = usePotluck(pid);
  const { user, isGuest } = useAuth();
  const navigate = useNavigate();

  if (isGuest) {
    return (
      <div className="page">
        <PageHeader title="Create a potluck" />
        <EmptyState emoji="🔐" title="Hosting needs a free account" action={<Button onClick={() => navigate('/profile')}>Save your account</Button>}>
          Guests can join and vote. To host your own showdown, turn your guest pass into an account. You’ll keep everything you’ve joined.
        </EmptyState>
      </div>
    );
  }
  if (editing && loading) return <Loading />;
  if (editing && !existing) return <div className="page"><PageHeader title="Edit potluck" /><EmptyState title="Potluck not found" /></div>;
  if (editing && existing.hostId !== user.uid) return <div className="page"><PageHeader title="Edit potluck" /><EmptyState title="Only the host can edit this potluck" /></div>;
  if (editing && existing.status === 'closed') return <div className="page"><PageHeader title="Edit potluck" /><EmptyState title="Results are final" emoji="🏁">This showdown is over, so it can’t be edited.</EmptyState></div>;
  return <PotluckEditor key={pid ?? 'new'} existing={editing ? existing : null} />;
}

function PotluckEditor({ existing }) {
  const editing = Boolean(existing);
  const pid = existing?.id;
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(() => (editing ? fromPotluck(existing) : loadDraft() ?? blankForm()));
  const [step, setStep] = useState(1);
  const [categoriesTouched, setCategoriesTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const scoringLocked = editing && phaseOf(existing) !== 'open';
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key) => ({ value: form[key], onChange: (e) => set(key, e.target.value) });
  const fmt = formatInfo(form.format);
  const total = weightsTotal(form.scoring);

  const setScoring = (i, patch) => set('scoring', form.scoring.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addScoring = (s) => {
    const remaining = Math.max(0, 100 - total);
    set('scoring', [...form.scoring, { id: '', name: s?.name ?? '', description: s?.description ?? '', weight: remaining }]);
  };
  const setCategory = (i, patch) => {
    setCategoriesTouched(true);
    set('dishCategories', form.dishCategories.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };

  const chooseFormat = (key) => {
    setForm((f) => ({ ...f, format: key, ...(!editing && !categoriesTouched ? { dishCategories: categoriesFor(key) } : {}) }));
  };

  const saveDraft = () => {
    const { coverData: _omit, ...rest } = form;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
    toast('Draft saved on this device');
  };

  const validateStep1 = () => {
    if (!form.title.trim()) return 'Give your challenge a title.';
    if (!form.date || !form.time) return 'Pick a date and time.';
    if (fmt.detailLabel && !form.formatDetail.trim()) return `Add the ${fmt.detailLabel.toLowerCase()} for this format.`;
    if (!editing && !isValidInviteCode(normalizeInviteCode(form.inviteCode))) return 'Invite codes use 4–20 letters, numbers, or dashes.';
    if (form.scoring.some((c) => !c.name.trim())) return 'Every scoring category needs a name.';
    if (total !== 100) return `Scoring weights must add up to 100% (currently ${total}%).`;
    return '';
  };

  const validateStep2 = () => {
    if (!form.dishCategories.some((c) => c.name.trim())) return 'Add at least one dish category.';
    if (form.votingOpensAt && form.votingClosesAt && form.votingClosesAt <= form.votingOpensAt) return 'Voting must close after it opens.';
    const guests = parseInt(form.maxGuests, 10);
    if (editing && guests && guests < existing.memberIds.length) return `There are already ${existing.memberIds.length} people going.`;
    return '';
  };

  const next = (e) => {
    e.preventDefault();
    const msg = validateStep1();
    setError(msg);
    if (!msg) {
      setStep(2);
      window.scrollTo(0, 0);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const msg = validateStep1() || validateStep2();
    setError(msg);
    if (msg) return;
    setBusy(true);
    try {
      if (editing) {
        await updatePotluck(existing, form);
        toast('Potluck updated');
        navigate(`/potlucks/${pid}`, { replace: true });
      } else {
        const id = await createPotluck(form);
        localStorage.removeItem(DRAFT_KEY);
        navigate(`/potlucks/${id}?invite=new`, { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={editing ? 'Edit potluck' : 'Create a potluck'}
        actions={!editing && <Button variant="link" className="fw-bold px-1" onClick={saveDraft}>Save draft</Button>}
      />
      {step === 2 && <button type="button" className="btn btn-link px-0 mb-1" onClick={() => setStep(1)}><i className="bi bi-chevron-left" /> Challenge setup</button>}
      <div className="form-step mb-3">{step === 1 ? 'Challenge setup' : 'Dishes & voting'} · {step} of 2</div>
      {error && <Alert variant="danger">{error}</Alert>}

      {step === 1 ? (
        <Form onSubmit={next} className="d-grid gap-3" noValidate>
          <Form.Group controlId="title">
            <Form.Label>Challenge title</Form.Label>
            <Form.Control
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                // Keep the suggested code readable ("HARVEST-7K2Q") until the host edits it.
                setForm((f) => ({
                  ...f,
                  title,
                  ...(!editing && !codeTouched ? { inviteCode: `${generateInviteCode(title).split('-')[0]}-${f.inviteCode.split('-').pop()}` } : {}),
                }));
              }}
              maxLength={80}
              placeholder="Healthy Harvest Cook-Off"
              required
            />
          </Form.Group>
          <Row className="g-3">
            <Col xs={7}>
              <Form.Group controlId="date">
                <Form.Label>Date</Form.Label>
                <Form.Control type="date" {...field('date')} required />
              </Form.Group>
            </Col>
            <Col xs={5}>
              <Form.Group controlId="time">
                <Form.Label>Time</Form.Label>
                <Form.Control type="time" {...field('time')} required />
              </Form.Group>
            </Col>
          </Row>
          <Form.Group controlId="location">
            <Form.Label>Location</Form.Label>
            <Form.Control {...field('location')} maxLength={160} placeholder="Hawthorne Hall rooftop" />
          </Form.Group>

          <div>
            <Form.Label>Competition format</Form.Label>
            <Row className="g-2" role="radiogroup">
              {FORMAT_KEYS.map((key) => (
                <Col xs={6} key={key}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.format === key}
                    onClick={() => chooseFormat(key)}
                    className={`w-100 h-100 text-start p-3 rounded-4 border ${form.format === key ? 'border-primary border-2 bg-white' : 'bg-white'}`}
                  >
                    <div className="fs-4" aria-hidden>{FORMATS[key].emoji}</div>
                    <div className="fw-bold">{FORMATS[key].label}</div>
                    <div className="small text-muted">{FORMATS[key].blurb}</div>
                  </button>
                </Col>
              ))}
            </Row>
          </div>
          {fmt.detailLabel && (
            <Form.Group controlId="formatDetail">
              <Form.Label>{fmt.detailLabel}</Form.Label>
              <Form.Control {...field('formatDetail')} maxLength={300} placeholder={fmt.detailPlaceholder} />
            </Form.Group>
          )}
          <Form.Group controlId="theme">
            <Form.Label>Challenge theme</Form.Label>
            <Form.Control {...field('theme')} maxLength={120} placeholder="Plant-based comfort food" />
          </Form.Group>
          <Form.Group controlId="description">
            <Form.Label>Description</Form.Label>
            <Form.Control as="textarea" rows={3} {...field('description')} maxLength={1000} placeholder="Bring a shareable, healthy dish and compete for the tastiest, most nutritious plate." />
          </Form.Group>

          {!editing && (
            <Form.Group controlId="inviteCode">
              <Form.Label>Invite code</Form.Label>
              <InputGroup>
                <Form.Control className="invite-code" value={form.inviteCode} onChange={(e) => { setCodeTouched(true); set('inviteCode', normalizeInviteCode(e.target.value)); }} />
                <Button variant="outline-primary" onClick={() => set('inviteCode', generateInviteCode(form.title))}>Generate</Button>
              </InputGroup>
              <Form.Text>Guests type this code or open your invite link to join.</Form.Text>
            </Form.Group>
          )}

          <div>
            <div className="d-flex justify-content-between align-items-baseline">
              <Form.Label className="fw-bold mb-1">Scoring categories</Form.Label>
              <span className={`small fw-bold ${total === 100 ? 'text-success' : 'text-danger'}`}>{total}% of 100%</span>
            </div>
            {scoringLocked && <Alert variant="warning" className="py-2 small">Voting has started, so scoring can’t change.</Alert>}
            <div className="d-grid gap-2">
              {form.scoring.map((c, i) => (
                <div key={i} className="card-soft p-3">
                  <div className="d-flex gap-2 align-items-start">
                    <div className="flex-grow-1 min-w-0">
                      <Form.Control aria-label="Category name" className="fw-bold border-0 p-0 mb-1 shadow-none" value={c.name} disabled={scoringLocked} maxLength={30} placeholder="Category name" onChange={(e) => setScoring(i, { name: e.target.value })} />
                      <Form.Control aria-label="Category description" size="sm" className="border-0 p-0 text-muted shadow-none" value={c.description} disabled={scoringLocked} maxLength={100} placeholder="What should voters judge?" onChange={(e) => setScoring(i, { description: e.target.value })} />
                    </div>
                    <InputGroup size="sm" style={{ width: 92 }} className="flex-shrink-0">
                      <Form.Control aria-label="Weight" type="number" inputMode="numeric" min={0} max={100} value={c.weight} disabled={scoringLocked} onChange={(e) => setScoring(i, { weight: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
                      <InputGroup.Text>%</InputGroup.Text>
                    </InputGroup>
                    {form.scoring.length > 1 && !scoringLocked && (
                      <Button variant="link" className="text-danger p-1" aria-label={`Remove ${c.name}`} onClick={() => set('scoring', form.scoring.filter((_, j) => j !== i))}>
                        <i className="bi bi-trash3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {form.scoring.length < MAX_SCORING && !scoringLocked && (
              <Dropdown className="mt-2">
                <Dropdown.Toggle variant="link" className="fw-bold px-0 text-decoration-none"><i className="bi bi-plus-lg me-1" />Add category</Dropdown.Toggle>
                <Dropdown.Menu>
                  {SCORING_SUGGESTIONS.filter((s) => !form.scoring.some((c) => c.name === s.name)).map((s) => (
                    <Dropdown.Item key={s.name} onClick={() => addScoring(s)}>{s.name}</Dropdown.Item>
                  ))}
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={() => addScoring()}>Custom…</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )}
          </div>

          <Button type="submit" size="lg" className="mt-2">Next: dishes &amp; voting</Button>
        </Form>
      ) : (
        <Form onSubmit={submit} className="d-grid gap-3" noValidate>
          <div>
            <Form.Label className="fw-bold mb-1">{form.format === 'courses' ? 'Course brackets' : 'Dish categories'}</Form.Label>
            <p className="small text-muted mb-2">
              Guests claim a spot when they add their dish. {form.format === 'courses' ? 'Each bracket gets its own winner.' : 'Each category with votes gets its own winner too.'}
            </p>
            <div className="d-grid gap-2">
              {form.dishCategories.map((c, i) => (
                <div key={c.id} className="card-soft p-2 ps-3 d-flex align-items-center gap-2">
                  <Form.Control aria-label="Category name" className="border-0 p-0 fw-semibold shadow-none" value={c.name} maxLength={40} placeholder="e.g. Desserts" onChange={(e) => setCategory(i, { name: e.target.value })} />
                  <InputGroup size="sm" style={{ width: 120 }} className="flex-shrink-0">
                    <InputGroup.Text>Need</InputGroup.Text>
                    <Form.Control aria-label="Dishes needed" type="number" inputMode="numeric" min={1} max={30} value={c.needed} onChange={(e) => setCategory(i, { needed: e.target.value })} />
                  </InputGroup>
                  {form.dishCategories.length > 1 && (
                    <Button variant="link" className="text-danger p-1" aria-label={`Remove ${c.name}`} onClick={() => { setCategoriesTouched(true); set('dishCategories', form.dishCategories.filter((_, j) => j !== i)); }}>
                      <i className="bi bi-trash3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {form.dishCategories.length < 12 && (
              <Button variant="link" className="fw-bold px-0 text-decoration-none mt-1" onClick={() => { setCategoriesTouched(true); set('dishCategories', [...form.dishCategories, { id: newId(), name: '', needed: 2 }]); }}>
                <i className="bi bi-plus-lg me-1" />Add category
              </Button>
            )}
          </div>

          <div className="card-soft p-3">
            <div className="fw-bold">Voting schedule <span className="text-muted fw-normal small">(optional)</span></div>
            <p className="small text-muted">Voting opens and closes on its own at these times. You can also open voting and publish results by hand from the event page.</p>
            <Row className="g-2">
              <Col sm={6}>
                <Form.Group controlId="votingOpensAt">
                  <Form.Label className="small">Voting opens</Form.Label>
                  <Form.Control type="datetime-local" {...field('votingOpensAt')} disabled={scoringLocked} />
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="votingClosesAt">
                  <Form.Label className="small">Voting closes</Form.Label>
                  <Form.Control type="datetime-local" {...field('votingClosesAt')} />
                </Form.Group>
              </Col>
            </Row>
          </div>

          <Form.Group controlId="maxGuests">
            <Form.Label>Guest limit</Form.Label>
            <Form.Control type="number" inputMode="numeric" min={0} placeholder="No limit" {...field('maxGuests')} />
          </Form.Group>

          <div>
            <Form.Label>Cover photo</Form.Label>
            <PhotoPicker
              title="Add a cover photo"
              current={form.coverImage}
              pending={form.coverData}
              onPick={(data) => set('coverData', data)}
              onRemove={() => setForm((f) => ({ ...f, coverData: null, coverImage: null }))}
            />
          </div>

          <div className="sticky-cta">
            <Button type="submit" size="lg" className="w-100 shadow" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create Challenge'}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}
