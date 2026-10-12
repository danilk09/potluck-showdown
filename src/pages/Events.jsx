import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Col, Nav, Row } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import { useMyPotlucks, useNow } from '../hooks/useFirestore';
import PotluckCard from '../components/PotluckCard';
import { EmptyState, Loading, PageHeader } from '../components/ui';
import { toMillis } from '../lib/scoring';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'hosting', label: 'Hosting' },
  { key: 'past', label: 'Past' },
];

export default function Events() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const [tab, setTab] = useState(() => sessionStorage.getItem('ps-events-tab') ?? 'upcoming');
  const { data: potlucks, loading } = useMyPotlucks();

  const lists = {
    upcoming: potlucks.filter((p) => p.status !== 'closed'),
    hosting: potlucks.filter((p) => p.hostId === user.uid),
    past: potlucks.filter((p) => p.status === 'closed').sort((a, b) => toMillis(b.startsAt) - toMillis(a.startsAt)),
  };
  const shown = lists[tab];

  const choose = (key) => {
    sessionStorage.setItem('ps-events-tab', key);
    setTab(key);
  };

  return (
    <div className="page-wide">
      <PageHeader title="Your events" back={false} />
      <Row className="g-2 mb-3" style={{ maxWidth: 520 }}>
        <Col><Button className="w-100" onClick={() => navigate('/create')}><i className="bi bi-plus-lg me-1" />Create</Button></Col>
        <Col><Button variant="outline-primary" className="w-100" onClick={() => navigate('/join')}>Join with code</Button></Col>
      </Row>
      <Nav variant="pills" activeKey={tab} onSelect={choose} className="gap-1 mb-3">
        {TABS.map((t) => (
          <Nav.Item key={t.key}>
            <Nav.Link eventKey={t.key} className="fw-semibold">{t.label} <span className="opacity-75">({lists[t.key].length})</span></Nav.Link>
          </Nav.Item>
        ))}
      </Nav>
      {loading ? <Loading /> : shown.length === 0 ? (
        <EmptyState emoji={tab === 'past' ? '📜' : '🗓️'} title={tab === 'past' ? 'No finished showdowns yet' : tab === 'hosting' ? 'You haven’t hosted yet' : 'Nothing coming up'}>
          {tab === 'hosting' ? 'Create a potluck and invite your friends with a code.' : 'Join a potluck with an invite code, or host your own.'}
        </EmptyState>
      ) : (
        <Row xs={1} lg={2} className="g-3">
          {shown.map((p) => <Col key={p.id}><PotluckCard potluck={p} now={now} /></Col>)}
        </Row>
      )}
    </div>
  );
}
