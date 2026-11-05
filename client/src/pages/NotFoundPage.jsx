// Any address that is not a page of the app (router path "*").
import { Link } from 'react-router';
import { homeFor } from '../auth/roles.js';
import { useAuth } from '../auth/useAuth.js';
import { routes } from '../routes.js';

export default function NotFoundPage() {
  const { user } = useAuth();
  const home = homeFor(user);
  return (
    <>
      <title>Page not found – Mountain Hut</title>
      <h1>Page not found</h1>
      <p>This address does not match any page.</p>
      <Link to={home}>{home === routes.staffSlots ? 'Go to slots' : 'Go to the home page'}</Link>
    </>
  );
}
