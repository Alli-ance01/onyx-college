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
  return 'The request could not be completed. Please try again.';
}

export function LoginPage() {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
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
    <main className="auth-content">
      <section className="auth-card surface" aria-labelledby="login-heading">
        <p className="eyebrow">Secure portal access</p>
        <h1 id="login-heading">Sign in</h1>
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
          <label>
            Username, email, or phone
            <input autoComplete="username" {...register('identifier')} />
            {errors.identifier && <span className="field-error">{errors.identifier.message}</span>}
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" {...register('password')} />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </label>
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

export function ChangePasswordPage() {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
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

  return (
    <main className="auth-content">
      <section className="auth-card surface" aria-labelledby="password-heading">
        <p className="eyebrow">Account security</p>
        <h1 id="password-heading">Change your password</h1>
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
          <label>
            Current password
            <input
              autoComplete="current-password"
              type="password"
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <span className="field-error">{errors.currentPassword.message}</span>
            )}
          </label>
          <label>
            New password
            <input autoComplete="new-password" type="password" {...register('newPassword')} />
            {errors.newPassword && (
              <span className="field-error">{errors.newPassword.message}</span>
            )}
          </label>
          <label>
            Confirm new password
            <input autoComplete="new-password" type="password" {...register('confirmPassword')} />
            {errors.confirmPassword && (
              <span className="field-error">{errors.confirmPassword.message}</span>
            )}
          </label>
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>
    </main>
  );
}
