import { Link } from 'react-router';
import crest from '../../../../../assets/branding/Official Onyx Logo.jpeg';

export function SchoolCrest({ className = '' }: { className?: string }) {
  return (
    <span className={`school-crest ${className}`} aria-hidden="true">
      <img src={crest} alt="" width="1080" height="1112" />
    </span>
  );
}
export function Brand({
  subtitle = 'We trust in excellence',
  to = '/',
}: {
  subtitle?: string;
  to?: string;
}) {
  return (
    <Link className="brand" to={to} aria-label="Onyx College Portal home">
      <SchoolCrest />
      <span>
        <strong>Onyx College</strong>
        <small>{subtitle}</small>
      </span>
    </Link>
  );
}
