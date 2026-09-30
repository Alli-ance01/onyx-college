import type { StudentDocumentAccessDto, SuccessEnvelope } from '@onyx/contracts';
import { useState } from 'react';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { Button } from '../../shared/ui/index.js';

export function ProtectedAttachmentButton({
  attachmentId,
  label,
}: {
  attachmentId: string;
  label: string;
}) {
  const auth = useAuthSession();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function openAttachment() {
    setFailed(false);
    setLoading(true);
    try {
      const response = await auth.apiClient.request<SuccessEnvelope<StudentDocumentAccessDto>>(
        `/assignments/attachments/${attachmentId}/download-url`,
      );
      if (response.data.delivery === 'SIGNED') {
        const signedUrl = new URL(response.data.url);
        if (signedUrl.protocol !== 'https:') throw new Error('Unsafe attachment URL.');
        const opened = window.open(signedUrl.toString(), '_blank', 'noopener,noreferrer');
        if (opened !== null) opened.opener = null;
      } else {
        const blob = await auth.apiClient.download(
          `/assignments/attachments/${attachmentId}/content`,
        );
        const objectUrl = URL.createObjectURL(blob);
        const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
        if (opened !== null) opened.opener = null;
        window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 60_000);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="student-file-action">
      <Button
        aria-label={`Open ${label}`}
        loading={loading}
        loadingLabel="Opening..."
        onClick={() => void openAttachment()}
        variant="secondary"
      >
        Open file
      </Button>
      {failed ? <span className="ui-field__error">The file could not be opened.</span> : null}
    </span>
  );
}
