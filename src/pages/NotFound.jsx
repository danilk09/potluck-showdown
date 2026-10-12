import { Link } from 'react-router';
import { Button } from 'react-bootstrap';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="page pt-4">
      <EmptyState emoji="🥄" title="This page isn’t on the menu" action={<Button as={Link} to="/">Go home</Button>} />
    </div>
  );
}
