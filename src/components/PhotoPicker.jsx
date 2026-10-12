import { useId, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { compressImage } from '../lib/images';
import { FsImage } from './ui';

/**
 * Photo input. On Android the native file chooser offers camera or gallery.
 * Selected photos are compressed on-device; the parent receives a data URL
 * (`onPick`) to upload on save, or `null` when the photo is removed.
 */
export default function PhotoPicker({ current, pending, onPick, onRemove, title, hint = 'Optional · JPG or PNG', compact = false }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onPick(await compressImage(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const hasPhoto = pending || current;
  return (
    <div>
      <input id={id} type="file" accept="image/*" className="d-none" onChange={handle} />
      {hasPhoto ? (
        <div className="position-relative rounded-4 overflow-hidden" style={{ aspectRatio: compact ? '4 / 3' : '16 / 10', maxHeight: 320 }}>
          {pending ? <img src={pending} alt="" className="img-fill" /> : <FsImage src={current} />}
          <div className="position-absolute bottom-0 end-0 m-2 d-flex gap-2">
            <Button as="label" htmlFor={id} size="sm" variant="light"><i className="bi bi-arrow-repeat me-1" />Replace</Button>
            <Button size="sm" variant="light" onClick={onRemove} aria-label="Remove photo"><i className="bi bi-trash" /></Button>
          </div>
        </div>
      ) : compact ? (
        <label htmlFor={id} className="btn btn-link px-0 text-decoration-none d-inline-flex align-items-center gap-2">
          {busy ? <Spinner size="sm" /> : <i className="bi bi-camera fs-5" />}
          <span className="small">{title}</span>
        </label>
      ) : (
        <label htmlFor={id} className="photo-drop">
          {busy ? <Spinner size="sm" variant="primary" /> : <i className="bi bi-camera fs-3 text-primary" />}
          <div className="fw-bold mt-1">{title}</div>
          <div className="small text-muted">{hint}</div>
        </label>
      )}
      {error && <div className="small text-danger mt-1">{error}</div>}
    </div>
  );
}
