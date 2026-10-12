import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Button, CloseButton, Container, Nav, Navbar } from 'react-bootstrap';
import { useAuth } from '../hooks/AuthContext';
import Avatar from './Avatar';
import { androidAppUrl, isNative } from '../lib/platform';

// Five destinations, per Android navigation-bar guidance. "Create" lives on
// Home/Events as a primary button; the recipe bank gets a tab of its own.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'house' },
  { to: '/feed', label: 'Feed', icon: 'image' },
  { to: '/recipes', label: 'Recipes', icon: 'journal-bookmark' },
  { to: '/events', label: 'Events', icon: 'calendar-event' },
  { to: '/profile', label: 'Profile', icon: 'person' },
];

export const ROOT_PATHS = NAV_ITEMS.map((n) => n.to);

function BottomNav() {
  return (
    <nav className="bottom-nav d-md-none" aria-label="Main">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          {({ isActive }) => (
            <>
              <span className="icon-pill">
                <i className={`bi bi-${item.icon}${isActive ? '-fill' : ''}`} />
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function TopNav() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  return (
    <Navbar className="top-nav d-none d-md-flex" expand="md">
      <Container className="page-wide">
        <Navbar.Brand as={Link} to="/" className="fw-800">🍲 Potluck Showdown</Navbar.Brand>
        <Nav className="mx-auto gap-1">
          {NAV_ITEMS.slice(0, 4).map((item) => (
            <Nav.Link key={item.to} as={NavLink} to={item.to} end={item.to === '/'}>
              <i className={`bi bi-${item.icon} me-1`} />{item.label}
            </Nav.Link>
          ))}
        </Nav>
        <div className="d-flex align-items-center gap-2">
          <Button size="sm" onClick={() => navigate('/create')}><i className="bi bi-plus-lg me-1" />Create</Button>
          <Link to="/profile" aria-label="Profile"><Avatar uid={user?.uid} profile={profile} size={38} /></Link>
        </div>
      </Container>
    </Navbar>
  );
}

/** Web-only nudge for invitees who joined from a browser. */
export function GetAppBanner() {
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('ps-hide-app-banner') === '1');
  const isAndroidBrowser = /Android/i.test(navigator.userAgent);
  if (isNative || hidden || !isAndroidBrowser) return null;
  return (
    <div className="get-app-banner d-flex align-items-center gap-2 p-2 ps-3 mb-3">
      <i className="bi bi-android2 fs-4 text-success" />
      <div className="flex-grow-1 small"><strong>Get the Android app</strong> for photo uploads, sharing, and offline recipes.</div>
      <Button size="sm" variant="light" href={androidAppUrl()}>Install</Button>
      <CloseButton variant="white" aria-label="Dismiss" onClick={() => { sessionStorage.setItem('ps-hide-app-banner', '1'); setHidden(true); }} />
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      {user && <TopNav />}
      <main className="app-main">
        <Container fluid="md">
          <Outlet />
        </Container>
      </main>
      {user && <BottomNav />}
    </div>
  );
}
