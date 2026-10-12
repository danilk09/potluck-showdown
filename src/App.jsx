import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import Layout, { ROOT_PATHS } from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './hooks/AuthContext';
import { isNative } from './lib/platform';
import Welcome from './pages/Welcome';
import { ForgotPassword, SignIn, SignUp } from './pages/Auth';
import Home from './pages/Home';
import PotluckForm from './pages/PotluckForm';
import Join from './pages/Join';
import EventDetail from './pages/EventDetail';
import DishForm from './pages/DishForm';
import DishDetail from './pages/DishDetail';
import RateDish from './pages/RateDish';
import Results from './pages/Results';
import Feed from './pages/Feed';
import Events from './pages/Events';
import RecipeBank from './pages/RecipeBank';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/welcome?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (user) return <Navigate to={new URLSearchParams(location.search).get('next') || '/'} replace />;
  return children;
}

/** Android integration: hardware back button + opening invite links in the app. */
function useAndroidIntegration() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!isNative) return undefined;
    SplashScreen.hide().catch(() => {});
    const back = CapApp.addListener('backButton', () => {
      // An open dialog closes on back, like any Android app.
      const modal = document.querySelector('.modal.show .btn-close');
      if (modal) return modal.click();
      if (ROOT_PATHS.includes(pathRef.current) || pathRef.current === '/welcome') return CapApp.minimizeApp();
      if (window.history.state?.idx > 0) return navigate(-1);
      return navigate('/');
    });
    // https://<host>/join/CODE (App Links) or potluckshowdown://join/CODE
    const open = CapApp.addListener('appUrlOpen', ({ url }) => {
      try {
        const u = new URL(url);
        const path = u.protocol.startsWith('http') ? u.pathname : `/${u.host}${u.pathname}`;
        navigate(path.replace(/\/+$/, '') + u.search);
      } catch {
        /* ignore malformed links */
      }
    });
    return () => {
      back.then((h) => h.remove());
      open.then((h) => h.remove());
    };
  }, [navigate]);
}

export default function App() {
  useAndroidIntegration();
  const location = useLocation();
  useEffect(() => {
    // Braces matter: newer Chromium returns a Promise from scrollTo, which React rejects as a cleanup.
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/welcome" element={<PublicOnly><Welcome /></PublicOnly>} />
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
      <Route path="/forgot" element={<PublicOnly><ForgotPassword /></PublicOnly>} />

      <Route element={<Layout />}>
        {/* Join handles signed-out invitees itself (guest join in the browser). */}
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />

        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/create" element={<RequireAuth><PotluckForm /></RequireAuth>} />
        <Route path="/potlucks/:pid" element={<RequireAuth><EventDetail /></RequireAuth>} />
        <Route path="/potlucks/:pid/edit" element={<RequireAuth><PotluckForm /></RequireAuth>} />
        <Route path="/potlucks/:pid/dish" element={<RequireAuth><DishForm /></RequireAuth>} />
        <Route path="/potlucks/:pid/dishes/:did" element={<RequireAuth><DishDetail /></RequireAuth>} />
        <Route path="/potlucks/:pid/dishes/:did/rate" element={<RequireAuth><RateDish /></RequireAuth>} />
        <Route path="/potlucks/:pid/results" element={<RequireAuth><Results /></RequireAuth>} />
        <Route path="/feed" element={<RequireAuth><Feed /></RequireAuth>} />
        <Route path="/feed/:pid" element={<RequireAuth><Feed /></RequireAuth>} />
        <Route path="/recipes" element={<RequireAuth><RecipeBank /></RequireAuth>} />
        <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
