import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = 'Working…',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = ['ui-button', `ui-button--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled === true || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <>
          <span aria-hidden="true" className="ui-button__spinner" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
