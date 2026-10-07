import { useState } from 'react';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { Button } from '../../shared/ui/button.js';

export function SignOutButton() {
  const auth = useAuthSession();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      await auth.logout();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="portal-signout">
      <Button
        variant="secondary"
        loading={pending}
        loadingLabel="Signing out…"
        onClick={() => {
          void signOut();
        }}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10" />
        </svg>
        Sign out
      </Button>
      {failed ? (
        <p role="alert" className="portal-signout__error">
          Could not sign out. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
