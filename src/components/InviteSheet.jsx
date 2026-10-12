import { Button, Modal } from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { copyText, inviteLink, shareLink } from '../lib/platform';
import { useToast } from './ui';

/**
 * Invite sheet. The link opens the web version for people without the app
 * (they can join as a guest in the browser); on phones with the Android app
 * installed, App Links open the same URL in the app instead.
 */
export default function InviteSheet({ potluck, show, onHide, justCreated }) {
  const toast = useToast();
  const url = inviteLink(potluck.inviteCode);
  const share = async () => {
    const res = await shareLink({
      title: potluck.title,
      text: `Join my potluck showdown "${potluck.title}"! Code: ${potluck.inviteCode}`,
      url,
    });
    if (res === 'copied') toast('Invite link copied');
  };
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fw-800">{justCreated ? 'Your showdown is live! 🎉' : 'Invite people'}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        <p className="text-muted">Share the code or link. Guests can join right in their browser, and no download is needed.</p>
        <div className="tile-peach py-3 mb-3">
          <div className="small-caps text-muted">Invite code</div>
          <div className="invite-code fs-2">{potluck.inviteCode}</div>
        </div>
        <div className="d-inline-block bg-white p-3 rounded-4 border mb-2">
          <QRCodeSVG value={url} size={168} fgColor="#221b17" />
        </div>
        <div className="small text-muted mb-3">Scan to join in person</div>
        <div className="d-grid gap-2">
          <Button size="lg" onClick={share}><i className="bi bi-share me-2" />Share invite</Button>
          <Button variant="outline-primary" onClick={async () => { await copyText(url); toast('Link copied'); }}>
            <i className="bi bi-link-45deg me-1" />Copy link
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
