import type { SuccessEnvelope } from '@onyx/contracts';
import { useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import { apiClient, ApiClientError } from '../../lib/api/index.js';
import { formText } from '../../shared/forms/form-data.js';
import { Button, FormField, Panel } from '../../shared/ui/index.js';

interface SetupResponse {
  registrationId: string;
  username: string;
}

export function TeacherSetupPage() {
  const [search] = useSearchParams();
  const token = search.get('token') ?? '';
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const password = formText(form, 'password');
    const passwordConfirmation = formText(form, 'passwordConfirmation');
    if (password !== passwordConfirmation) {
      setError('The passwords do not match.');
      return;
    }
    setPending(true);
    try {
      await apiClient.request<SuccessEnvelope<SetupResponse>>('/teacher-invitations/accept', {
        body: {
          address: formText(form, 'address') || undefined,
          firstName: formText(form, 'firstName'),
          lastName: formText(form, 'lastName'),
          middleName: formText(form, 'middleName') || undefined,
          password,
          passwordConfirmation,
          phone: formText(form, 'phone') || undefined,
          qualifications: formText(form, 'qualifications') || undefined,
          token,
          username: formText(form, 'username'),
        },
        method: 'POST',
      });
      setCompleted(true);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Account setup could not be completed. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (completed) {
    return (
      <main className="auth-page">
        <Panel title="Account setup complete">
          <p>Your profile has been submitted for school approval.</p>
          <Link className="ui-button ui-button--primary" to="/auth/login">
            Continue to sign in
          </Link>
        </Panel>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <header className="auth-page__heading">
        <p className="eyebrow">Private staff invitation</p>
        <h1>Set up your teacher account</h1>
        <p>
          Complete your profile and choose secure credentials. Access remains restricted until
          approval.
        </p>
      </header>
      <form className="auth-card form-stack" onSubmit={(event) => void submit(event)}>
        {token === '' ? (
          <p className="form-alert form-alert--error" role="alert">
            This setup link is incomplete. Ask the school for a new invitation.
          </p>
        ) : null}
        <div className="form-grid form-grid--two">
          <FormField controlId="teacher-first-name" label="First name">
            <input name="firstName" required autoComplete="given-name" />
          </FormField>
          <FormField controlId="teacher-last-name" label="Surname">
            <input name="lastName" required autoComplete="family-name" />
          </FormField>
          <FormField controlId="teacher-middle-name" label="Middle name" optional>
            <input name="middleName" autoComplete="additional-name" />
          </FormField>
          <FormField controlId="teacher-phone" label="Phone" optional>
            <input name="phone" autoComplete="tel" inputMode="tel" />
          </FormField>
        </div>
        <FormField controlId="teacher-address" label="Address" optional>
          <textarea name="address" rows={3} />
        </FormField>
        <FormField controlId="teacher-qualifications" label="Qualifications" optional>
          <textarea name="qualifications" rows={3} />
        </FormField>
        <FormField controlId="teacher-username" label="Username">
          <input name="username" required autoComplete="username" minLength={3} />
        </FormField>
        <div className="form-grid form-grid--two">
          <FormField
            controlId="teacher-password"
            label="Password"
            hint="Use at least 12 characters."
          >
            <input
              name="password"
              required
              autoComplete="new-password"
              minLength={12}
              type="password"
            />
          </FormField>
          <FormField controlId="teacher-password-confirmation" label="Confirm password">
            <input
              name="passwordConfirmation"
              required
              autoComplete="new-password"
              minLength={12}
              type="password"
            />
          </FormField>
        </div>
        {error === undefined ? null : (
          <p className="form-alert form-alert--error" role="alert">
            {error}
          </p>
        )}
        <Button
          disabled={token === ''}
          loading={pending}
          loadingLabel="Creating account"
          type="submit"
        >
          Complete account setup
        </Button>
      </form>
    </main>
  );
}
