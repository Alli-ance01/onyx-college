import { cloneElement, type ReactElement } from 'react';

interface FieldControlProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  id?: string;
}

interface FormFieldProps {
  children: ReactElement<FieldControlProps>;
  className?: string;
  controlId: string;
  error?: string;
  hint?: string;
  label: string;
  optional?: boolean;
}

export function FormField({
  children,
  className,
  controlId,
  error,
  hint,
  label,
  optional = false,
}: FormFieldProps) {
  const descriptionIds = [
    hint === undefined ? null : `${controlId}-hint`,
    error === undefined ? null : `${controlId}-error`,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');
  const describedBy = [children.props['aria-describedby'], descriptionIds]
    .filter((value): value is string => value !== undefined && value !== '')
    .join(' ');
  const controlProps: FieldControlProps = {
    id: children.props.id ?? controlId,
  };

  if (describedBy !== '') controlProps['aria-describedby'] = describedBy;
  if (error !== undefined) controlProps['aria-invalid'] = true;

  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={controlId}>
        <span>{label}</span>
        {optional ? <span className="ui-field__optional">Optional</span> : null}
      </label>
      <div className="ui-field__control">{cloneElement(children, controlProps)}</div>
      {hint === undefined ? null : (
        <p className="ui-field__hint" id={`${controlId}-hint`}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p className="ui-field__error" id={`${controlId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
