import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="app-center">
      <div className="app-notice card">
        <p className="app-notice__code">404</p>
        <h1 className="app-notice__title">Page not found</h1>
        <p className="muted">The page you are looking for does not exist or has been moved.</p>
        <Link className="btn btn-primary" to="/">
          Back to MDHub
        </Link>
      </div>
    </div>
  );
}
