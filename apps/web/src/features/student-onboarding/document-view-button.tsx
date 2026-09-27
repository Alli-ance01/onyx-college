import type { StudentDocumentAccessDto, SuccessEnvelope } from '@onyx/contracts';
import { useState } from 'react';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';

export function DocumentViewButton({
  documentId,
  label = 'View document',
}: {
  documentId: string;
  label?: string;
}) {
  const auth = useAuthSession();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const openDocument = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const access = await auth.apiClient.request<SuccessEnvelope<StudentDocumentAccessDto>>(
        '/student-documents/' + documentId + '/download-url',
      );
      if (access.data.delivery === 'SIGNED') {
        const signedUrl = new URL(access.data.url);
        if (signedUrl.protocol !== 'https:') throw new Error('Unsafe document URL.');
        const opened = window.open(signedUrl.toString(), '_blank', 'noopener,noreferrer');
        if (opened !== null) opened.opener = null;
        return;
      }
      const blob = await auth.apiClient.download('/student-documents/' + documentId + '/content');
      const objectUrl = URL.createObjectURL(blob);
      const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (opened !== null) opened.opener = null;
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span>
      <button className="text-button" disabled={loading} onClick={() => void openDocument()}>
        {loading ? 'Opening…' : label}
      </button>
      {failed ? <span className="field-error">Unable to open this document.</span> : null}
    </span>
  );
}
