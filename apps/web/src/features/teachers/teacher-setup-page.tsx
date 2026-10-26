import type { SuccessEnvelope } from '@onyx/contracts';
import { useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import { apiClient, ApiClientError } from '../../lib/api/index.js';
import { resolveErrorMessage } from '../../shared/error-messages.js';
import { formText } from '../../shared/forms/form-data.js';
import { SchoolCrest } from '../../shared/ui/brand.js';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const password = formText(form, 'password');
    const passwordConfirmation = formText(form, 'passwordConfirmation');
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
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
          : resolveErrorMessage(cause, {
              action: 'complete teacher account setup',
              entity: 'teacher account',
            }),
      );
    } finally {
      setPending(false);
    }
  }

  if (completed) {
    return (
      <main className="auth-content auth-content--split">
        <aside className="auth-aside" aria-label="Faculty onboarding guidance">
          <SchoolCrest className="school-crest--auth" />
          <p className="eyebrow">Faculty Onboarding</p>
          <h2>Welcome to Onyx College.</h2>
          <p className="auth-aside__description">
            Your educator profile and credentials have been securely registered with the school
            administration.
          </p>
          <p className="auth-aside__footer">Onyx College · We trust in excellence</p>
        </aside>

        <section
          className="auth-card surface teacher-setup-card"
          aria-labelledby="complete-heading"
        >
          <div className="auth-card__topline">
            <span>Status</span>
            <span>Submission Received</span>
          </div>
          <p className="eyebrow">Account setup complete</p>
          <h1 id="complete-heading">Profile submitted for review.</h1>
          <p className="auth-card__intro">
            Your educator profile and credentials have been submitted. An administrator will review
            your account, assign your teaching classes and subjects, and activate full portal
            access.
          </p>
          <div style={{ marginTop: '2.5rem' }}>
            <Link className="primary-button auth-submit" to="/auth/login">
              <span>Proceed to sign in</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="auth-card__footer">
            Need assistance? Contact the school office or system administrator.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-content auth-content--split">
      <aside className="auth-aside" aria-label="Faculty onboarding guidance">
        <SchoolCrest className="school-crest--auth" />
        <p className="eyebrow">Faculty Onboarding</p>
        <h2>Join the Onyx teaching faculty.</h2>
        <p className="auth-aside__description">
          Welcome to Onyx College. Set up your educator profile and secure credentials to prepare
          your academic workspace.
        </p>
        <ol className="auth-aside__steps">
          <li>
            <span aria-hidden="true">01</span>
            <span>Accept your private staff invitation.</span>
          </li>
          <li>
            <span aria-hidden="true">02</span>
            <span>Provide your teaching credentials and contact details.</span>
          </li>
          <li>
            <span aria-hidden="true">03</span>
            <span>Await administrator review and class assignments.</span>
          </li>
        </ol>
        <p className="auth-aside__footer">Onyx College · We trust in excellence</p>
      </aside>

      <section
        className="auth-card surface teacher-setup-card"
        aria-labelledby="teacher-setup-title"
      >
        <div className="auth-card__topline">
          <span>Staff Invitation</span>
          <span>Step 01</span>
        </div>
        <p className="eyebrow">Private invitation</p>
        <h1 id="teacher-setup-title">Set up your teacher account.</h1>
        <p className="auth-card__intro">
          Complete your profile and choose your login credentials. Academic assignments and portal
          access are granted following administrative review.
        </p>

        {token === '' ? (
          <div className="form-alert form-alert--error" role="alert">
            This setup link is incomplete or missing its invitation token. Please check your
            invitation email or contact the school administrator for a new link.
          </div>
        ) : null}

        {error !== undefined ? (
          <div className="form-alert form-alert--error" role="alert">
            {error}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid form-grid--two">
            <label className="auth-field">
              <span>First name</span>
              <input autoComplete="given-name" name="firstName" placeholder="e.g. John" required />
            </label>
            <label className="auth-field">
              <span>Surname</span>
              <input
                autoComplete="family-name"
                name="lastName"
                placeholder="e.g. Adeyemi"
                required
              />
            </label>
          </div>

          <div className="form-grid form-grid--two">
            <label className="auth-field">
              <span>
                Middle name <span className="optional-label">Optional</span>
              </span>
              <input
                autoComplete="additional-name"
                name="middleName"
                placeholder="e.g. Babatunde"
              />
            </label>
            <label className="auth-field">
              <span>
                Phone number <span className="optional-label">Optional</span>
              </span>
              <input
                autoComplete="tel"
                inputMode="tel"
                name="phone"
                placeholder="e.g. +234 801 234 5678"
                type="tel"
              />
            </label>
          </div>

          <label className="auth-field">
            <span>
              Residential address <span className="optional-label">Optional</span>
            </span>
            <textarea
              name="address"
              placeholder="e.g. 14 Admiralty Way, Lekki Phase 1, Lagos"
              rows={2}
            />
          </label>

          <label className="auth-field">
            <span>
              Academic & professional qualifications{' '}
              <span className="optional-label">Optional</span>
            </span>
            <textarea
              name="qualifications"
              placeholder="e.g. B.Sc Mathematics (Unilag), PGDE, TRCN Certified"
              rows={2}
            />
          </label>

          <label className="auth-field">
            <span>Choose a username</span>
            <input
              autoComplete="username"
              minLength={3}
              name="username"
              placeholder="e.g. j.adeyemi"
              required
            />
          </label>

          <div className="form-grid form-grid--two">
            <label className="auth-field">
              <span>Password</span>
              <span className="auth-input-wrap">
                <input
                  autoComplete="new-password"
                  minLength={12}
                  name="password"
                  required
                  type={showPassword ? 'text' : 'password'}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="password-toggle"
                  onClick={() => {
                    setShowPassword((prev) => !prev);
                  }}
                  type="button"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            <label className="auth-field">
              <span>Confirm password</span>
              <span className="auth-input-wrap">
                <input
                  autoComplete="new-password"
                  minLength={12}
                  name="passwordConfirmation"
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                />
                <button
                  aria-label={
                    showConfirmPassword
                      ? 'Hide password confirmation'
                      : 'Show password confirmation'
                  }
                  className="password-toggle"
                  onClick={() => {
                    setShowConfirmPassword((prev) => !prev);
                  }}
                  type="button"
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
          </div>

          <p className="auth-password-note">
            <span aria-hidden="true">ℹ</span>
            <span>
              Use at least 12 characters. Choose a unique password not shared with other accounts.
            </span>
          </p>

          <button
            className="primary-button auth-submit"
            disabled={pending || token === ''}
            type="submit"
          >
            <span>{pending ? 'Submitting profile…' : 'Complete teacher setup'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>

        <p className="auth-card__footer">
          Already completed setup? <Link to="/auth/login">Sign in to your portal</Link>
        </p>
      </section>
    </main>
  );
}
