import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';

import { ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your username, email, or phone number.'),
  password: z.string().min(1, 'Enter your password.'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(12, 'Use at least 12 characters.'),
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'The new passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Choose a password different from your current password.',
    path: ['newPassword'],
  });

type LoginFields = z.infer<typeof loginSchema>;
type PasswordFields = z.infer<typeof passwordSchema>;

function portalPath(portal: 'ADMIN' | 'ONBOARDING' | 'STUDENT' | 'TEACHER'): string {
  if (portal === 'ADMIN') return '/admin';
  if (portal === 'TEACHER') return '/teacher';
  if (portal === 'STUDENT') return '/student';
  return '/onboarding';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'The username or password is incorrect.';
    if (error.code === 'ACCOUNT_LOCKED')
      return 'This account is temporarily locked. Try again later.';
    if (error.code === 'ACCOUNT_UNAVAILABLE') return 'This account is not available for sign in.';
    return error.message;
  }
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return 'The service is taking longer than expected. Check your connection and try again.';
  }
  return 'The request could not be completed. Please try again.';
}

function AuthAside({
  eyebrow,
  title,
  description,
  steps,
}: {
  description: string;
  eyebrow: string;
  steps: readonly string[];
  title: string;
}) {
  return (
    <aside className="auth-aside" aria-label="Onyx College guidance">
      <div className="auth-aside__mark" aria-hidden="true">
        O
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="auth-aside__description">{description}</p>
      <ol className="auth-aside__steps">
        {steps.map((step, index) => (
          <li key={step}>
            <span aria-hidden="true">0{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="auth-aside__footer">Private by design · Ready when you are</p>
    </aside>
  );
}

function PasswordField({
  autoComplete,
  error,
  label,
  name,
  register,
  show,
  onToggle,
}: {
  autoComplete: 'current-password' | 'new-password';
  error: string | undefined;
  label: string;
  name: 'currentPassword' | 'newPassword' | 'confirmPassword';
  register: ReturnType<typeof useForm<PasswordFields>>['register'];
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <span className="auth-input-wrap">
        <input
          aria-invalid={error !== undefined}
          autoComplete={autoComplete}
          type={show ? 'text' : 'password'}
          {...register(name)}
        />
        <button
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="password-toggle"
          onClick={onToggle}
          type="button"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
      {error === undefined ? null : <span className="field-error">{error}</span>}
    </label>
  );
}

export function LoginPage() {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFields>({ resolver: zodResolver(loginSchema) });

  if (auth.status === 'checking')
    return <main className="route-status">Checking your secure session…</main>;

  if (auth.status === 'authenticated') {
    return (
      <Navigate
        replace
        to={
          auth.principal.mustChangePassword
            ? '/auth/change-password'
            : portalPath(auth.principal.portal)
        }
      />
    );
  }

  const submit = handleSubmit(async (fields) => {
    setSubmissionError(null);
    try {
      await auth.login(fields);
      const from = (location.state as { from?: string } | null)?.from;
      await navigate(from ?? '/', { replace: true });
    } catch (error) {
      setSubmissionError(errorMessage(error));
    }
  });

  return (
    <main className="auth-content auth-content--split">
      <AuthAside
        description="One considered entry point for every role in the Onyx community. Your workspace opens with the right tools, permissions, and next step."
        eyebrow="A calmer school day"
        steps={[
          'Use the access details issued by your school.',
          'We will take you to the right workspace.',
          'Keep your work private and close at hand.',
        ]}
        title="Your school day, in better order."
      />
      <section className="auth-card surface" aria-labelledby="login-heading">
        <div className="auth-card__topline">
          <span>01</span>
          <span>Secure access</span>
        </div>
        <p className="eyebrow">Welcome back</p>
        <h1 id="login-heading">Sign in to Onyx.</h1>
        <p className="auth-card__intro">
          Use the account credentials issued for your portal access.
        </p>
        {auth.status === 'expired' && (
          <div className="form-alert" role="status">
            Your session ended. Sign in again to continue.
          </div>
        )}
        {submissionError !== null && (
          <div className="form-alert form-alert--error" role="alert">
            {submissionError}
          </div>
        )}
        <form
          className="auth-form"
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <label className="auth-field">
            <span>Username, email, or phone</span>
            <input
              aria-invalid={errors.identifier !== undefined}
              autoComplete="username"
              {...register('identifier')}
            />
            {errors.identifier && <span className="field-error">{errors.identifier.message}</span>}
          </label>
          <label className="auth-field">
            <span>Password</span>
            <span className="auth-input-wrap">
              <input
                aria-invalid={errors.password !== undefined}
                autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="password-toggle"
                onClick={() => {
                  setShowPassword((value) => !value);
                }}
                type="button"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </label>
          <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
            <span>{isSubmitting ? 'Signing in…' : 'Continue to workspace'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="auth-card__footer">
          <span>Need an applicant account?</span> <a href="/student-signup">Start an application</a>
        </p>
      </section>
    </main>
  );
}

export function ChangePasswordPage() {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [visibleFields, setVisibleFields] = useState<Record<keyof PasswordFields, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<PasswordFields>({ resolver: zodResolver(passwordSchema) });

  if (auth.status === 'checking')
    return <main className="route-status">Checking your session…</main>;
  if (auth.status !== 'authenticated') return <Navigate replace to="/auth/login" />;

  const submit = handleSubmit(async ({ confirmPassword: _confirmation, ...fields }) => {
    setSubmissionError(null);
    try {
      await auth.changePassword(fields);
      await navigate(portalPath(auth.principal.portal), { replace: true });
    } catch (error) {
      const diagnostic =
        error instanceof ApiClientError
          ? {
              code: error.code,
              message: error.message,
              requestId: error.requestId,
              status: error.status,
            }
          : error instanceof Error
            ? { message: error.message, name: error.name }
            : { type: typeof error };
      console.error('[Onyx auth] Password change failed', diagnostic);
      setSubmissionError(errorMessage(error));
    }
  });

  const toggle = (field: keyof PasswordFields) => {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  };

  return (
    <main className="auth-content auth-content--split">
      <AuthAside
        description="A good password is easy for you to remember and difficult for anyone else to guess. This change protects your account across every school workspace."
        eyebrow="One important step"
        steps={[
          'Enter the temporary or current password.',
          'Create a unique password with 12+ characters.',
          'You will arrive in your portal when it is saved.',
        ]}
        title="Make this account yours."
      />
      <section className="auth-card surface" aria-labelledby="password-heading">
        <div className="auth-card__topline">
          <span>02</span>
          <span>Account security</span>
        </div>
        <p className="eyebrow">Security checkpoint</p>
        <h1 id="password-heading">Set a new password.</h1>
        <p className="auth-card__intro">
          {auth.principal.mustChangePassword
            ? 'Replace your temporary password before entering the portal.'
            : 'Changing your password signs out your other active sessions.'}
        </p>
        {submissionError !== null && (
          <div className="form-alert form-alert--error" role="alert">
            {submissionError}
          </div>
        )}
        <form
          className="auth-form"
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <PasswordField
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            label="Current password"
            name="currentPassword"
            onToggle={() => {
              toggle('currentPassword');
            }}
            register={register}
            show={visibleFields.currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            error={errors.newPassword?.message}
            label="New password"
            name="newPassword"
            onToggle={() => {
              toggle('newPassword');
            }}
            register={register}
            show={visibleFields.newPassword}
          />
          <PasswordField
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            label="Confirm new password"
            name="confirmPassword"
            onToggle={() => {
              toggle('confirmPassword');
            }}
            register={register}
            show={visibleFields.confirmPassword}
          />
          <p className="auth-password-note">
            <span aria-hidden="true">i</span> Use at least 12 characters. A phrase you can remember
            is stronger than a predictable pattern.
          </p>
          <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
            <span>{isSubmitting ? 'Saving securely…' : 'Save new password'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      </section>
    </main>
  );
}
