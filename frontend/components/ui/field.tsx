import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="rv-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? <p id={`${id}-help`}>{help}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="rv-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('rv-input', className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('rv-input', className)} {...props} />;
}
export function CheckboxField({
  label,
  error,
  id,
  ...props
}: ComponentProps<'input'> & { label: string; error?: string; id: string }) {
  return (
    <div className="rv-field">
      <label className="raak-checkbox" htmlFor={id}>
        <input
          {...props}
          type="checkbox"
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="rv-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
