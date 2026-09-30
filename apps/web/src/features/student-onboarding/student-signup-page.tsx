import type { SuccessEnvelope } from '@onyx/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { publicEnvironment } from '../../config/public-environment.js';
import { ApiClient, ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';

interface SignupForm {
  email?: string;
  password: string;
  passwordConfirmation: string;
  phone?: string;
  username: string;
}

const publicClient = new ApiClient({ baseUrl: publicEnvironment.VITE_API_BASE_URL });

export function StudentSignupPage() {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<SignupForm>();

  const submit = handleSubmit(async (values) => {
    setError(undefined);
    try {
      await publicClient.request<SuccessEnvelope<{ registrationId: string }>>('/student-signups', {
        body: values,
        method: 'POST',
      });
      await auth.login({ identifier: values.username, password: values.password });
      void navigate('/onboarding', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'We could not create your account. Please try again.',
      );
    }
  });

  return (
    <main className="auth-content auth-content--split">
      <aside className="auth-aside" aria-label="Onyx College application guidance">
        <div className="auth-aside__mark" aria-hidden="true">O</div>
        <p className="eyebrow">Student admissions</p>
        <h2>Your next chapter starts with a clear first step.</h2>
        <p className="auth-aside__description">
          Create one account for your application, documents, and updates from the school.
        </p>
        <ol className="auth-aside__steps">
          <li><span aria-hidden="true">01</span><span>Create your applicant account.</span></li>
          <li><span aria-hidden="true">02</span><span>Complete the registration details.</span></li>
          <li><span aria-hidden="true">03</span><span>Track review and next steps.</span></li>
        </ol>
        <p className="auth-aside__footer">A considered start makes the rest clearer.</p>
      </aside>
      <section className="auth-card surface signup-card" aria-labelledby="signup-title">
        <div className="auth-card__topline"><span>01</span><span>Student application</span></div>
        <p className="eyebrow">Begin here</p>
        <h1 id="signup-title">Create your applicant account.</h1>
        <p className="auth-card__intro">
          This account lets you complete an application. Student status and portal access begin only
          after school approval.
        </p>
        {error === undefined ? null : (
          <div className="form-alert form-alert--error" role="alert">
            {error}
          </div>
        )}
        <form
          className="auth-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            Username
            <input
              autoComplete="username"
              {...register('username', {
                required: 'Choose a username.',
                minLength: { value: 3, message: 'Use at least 3 characters.' },
                pattern: {
                  value: /^[a-zA-Z0-9._-]+$/u,
                  message: 'Use letters, numbers, dots, dashes, or underscores.',
                },
              })}
            />
            {errors.username === undefined ? null : (
              <span className="field-error">{errors.username.message}</span>
            )}
          </label>
          <div className="form-grid form-grid--two">
            <label>
              Email address <span className="optional-label">Optional</span>
              <input autoComplete="email" type="email" {...register('email')} />
            </label>
            <label>
              Phone number <span className="optional-label">Optional</span>
              <input autoComplete="tel" type="tel" {...register('phone')} />
            </label>
          </div>
          <label>
            Password
            <input
              autoComplete="new-password"
              type="password"
              {...register('password', {
                required: 'Create a password.',
                minLength: { value: 12, message: 'Use at least 12 characters.' },
              })}
            />
            {errors.password === undefined ? null : (
              <span className="field-error">{errors.password.message}</span>
            )}
          </label>
          <label>
            Confirm password
            <input
              autoComplete="new-password"
              type="password"
              {...register('passwordConfirmation', {
                required: 'Confirm your password.',
                validate: (value, form) => value === form.password || 'Passwords do not match.',
              })}
            />
            {errors.passwordConfirmation === undefined ? null : (
              <span className="field-error">{errors.passwordConfirmation.message}</span>
            )}
          </label>
          <button className="primary-button auth-submit" disabled={isSubmitting} type="submit">
            <span>{isSubmitting ? 'Creating secure account…' : 'Create account and continue'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="auth-card__footer">
          Already have an account? <Link to="/auth/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
