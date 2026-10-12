import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Modal, Spinner, Toast, ToastContainer } from 'react-bootstrap';
import { loadImage } from '../data/api';
import { tapFeedback } from '../lib/platform';

export function PageHeader({ title, back = true, backTo, actions, children }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (backTo) navigate(backTo);
    else if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <div className="page-header">
      {back && (
        <button type="button" className="btn-back" onClick={goBack} aria-label="Back">
          <i className="bi bi-arrow-left" />
        </button>
      )}
      <h1 className="flex-grow-1 text-truncate">{title}</h1>
      {actions}
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="d-flex justify-content-center align-items-center gap-2 py-5 text-muted">
      <Spinner animation="border" size="sm" variant="primary" /> {label}
    </div>
  );
}

export function EmptyState({ emoji = '🍽️', title, children, action }) {
  return (
    <div className="empty-state card-soft">
      <span className="emoji" aria-hidden>{emoji}</span>
      <h2 className="h5 fw-bold text-body">{title}</h2>
      {children && <p className="mb-3">{children}</p>}
      {action}
    </div>
  );
}

/** Renders an `img:` Firestore image reference or a URL, with a themed fallback. */
export function FsImage({ src, alt = '', className = 'img-fill', fallback = '🍲' }) {
  const [state, setState] = useState({ src: null, for: null });
  useEffect(() => {
    let alive = true;
    if (src) {
      loadImage(src).then((url) => alive && setState({ src: url, for: src })).catch(() => alive && setState({ src: null, for: src }));
    }
    return () => { alive = false; };
  }, [src]);
  const url = state.for === src ? state.src : null;
  if (!url) return <div className="cover-fallback" role="img" aria-label={alt}>{fallback}</div>;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

export function ChipToggleGroup({ options, value, onChange, ariaLabel, warn = false }) {
  const toggle = (opt) => {
    tapFeedback();
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <div className="d-flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`toggle-chip ${warn ? 'warn' : ''} ${value.includes(opt) ? 'on' : ''}`}
          aria-pressed={value.includes(opt)}
          onClick={() => toggle(opt)}
        >
          {value.includes(opt) && <i className="bi bi-check-lg me-1" />}{opt}
        </button>
      ))}
    </div>
  );
}

export function StarRating({ value, onChange, label }) {
  return (
    <div className="star-row" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`${n <= value ? 'lit' : ''} ${n === value ? 'current' : ''}`}
          onClick={() => { tapFeedback(); onChange(n); }}
        >
          <i className="bi bi-star-fill" />
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, className = '' }) {
  if (value == null) return <span className={`text-muted small ${className}`}>No votes</span>;
  return (
    <span className={`text-nowrap ${className}`} aria-label={`${value.toFixed(1)} out of 5`}>
      <i className="bi bi-star-fill text-warning me-1" />
      <strong>{value.toFixed(1)}</strong>
      <span className="text-muted">/5</span>
    </span>
  );
}

/**
 * Promise-based confirm dialog (native `window.confirm` looks out of place on Android).
 * const [confirmEl, confirm] = useConfirm(); if (await confirm({ title, body })) ...
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };
  const element = (
    <Modal show={Boolean(state)} onHide={() => close(false)} centered>
      <Modal.Header closeButton className="border-0 pb-0"><Modal.Title className="h5 fw-bold">{state?.title}</Modal.Title></Modal.Header>
      {state?.body && <Modal.Body className="text-muted">{state.body}</Modal.Body>}
      <Modal.Footer className="border-0">
        <Button variant="light" onClick={() => close(false)}>Cancel</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel ?? 'Confirm'}</Button>
      </Modal.Footer>
    </Modal>
  );
  return [element, confirm];
}

// ---------- toasts ----------
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const show = useCallback((message, variant = 'dark') => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, message, variant }]);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastContainer position="top-center" className="p-3" style={{ zIndex: 2000, marginTop: 'var(--sa-top)' }}>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            bg={t.variant}
            autohide
            delay={2800}
            onClose={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          >
            <Toast.Body className={t.variant === 'dark' || t.variant === 'danger' ? 'text-white' : ''}>{t.message}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
