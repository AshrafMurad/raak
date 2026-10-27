'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { apiRequest } from '../../../lib/api-client';
import { capabilityTokenFromLocation, locationWithoutCapabilityToken } from '../../../lib/capability-token';
import {
  isValidEmail,
  isValidPassword,
  isValidSlug,
} from '../../../lib/form-validation';
import type { Dictionary, Locale } from '../../../lib/i18n';

type AuthCopy = Dictionary['auth'];

const inputClass =
  'mt-2 w-full rounded-[var(--raak-radius-control)] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-subtle';
const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-[var(--raak-radius-control)] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

function Notice({ kind, children }: { kind: 'error' | 'success'; children: string }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-[var(--raak-radius-control)] border px-4 py-3 text-sm ${
        kind === 'error'
          ? 'border-[var(--raak-status-danger)]/30 bg-red-50 text-[var(--raak-status-danger)]'
          : 'border-[var(--raak-status-success)]/30 bg-emerald-50 text-[var(--raak-status-success)]'
      }`}
    >
      {children}
    </p>
  );
}

function useCapabilityToken(): string | undefined {
  const [token, setToken] = useState<string>();
  useEffect(() => {
    const location = new URL(window.location.href);
    setToken(capabilityTokenFromLocation(location));
    if (location.searchParams.has('token')) {
      window.history.replaceState(null, '', locationWithoutCapabilityToken(location));
    }
  }, []);
  return token;
}

function clearCapabilityLocation(): void {
  const location = new URL(window.location.href);
  window.history.replaceState(null, '', locationWithoutCapabilityToken(location));
}

export function RegistrationForm({ copy }: { copy: AuthCopy }) {
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const slug = String(data.get('slug') ?? '').trim();
    const supportEmail = String(data.get('supportEmail') ?? '').trim();
    const ownerEmail = String(data.get('ownerEmail') ?? '').trim();
    const ownerPassword = String(data.get('ownerPassword') ?? '');
    if (!isValidSlug(slug)) return setError(copy.validation.slug);
    if (!isValidEmail(supportEmail) || !isValidEmail(ownerEmail)) return setError(copy.validation.email);
    if (!isValidPassword(ownerPassword)) return setError(copy.validation.password);
    setError('');
    startTransition(async () => {
      try {
        await apiRequest(
          '/agencies/register',
          {
            method: 'POST',
            body: JSON.stringify({
              slug,
              legalName: String(data.get('legalName') ?? '').trim(),
              displayName: String(data.get('displayName') ?? '').trim(),
              timezone: String(data.get('timezone') ?? ''),
              currency: String(data.get('currency') ?? ''),
              supportEmail,
              ownerEmail,
              ownerPassword,
            }),
          },
          'platform',
        );
        setCreated(true);
        form.reset();
      } catch {
        setError(copy.validation.request);
      }
    });
  }

  if (created) {
    return (
      <section className="rounded-card border border-line bg-surface p-7 shadow-[var(--raak-shadow-subtle)] sm:p-9">
        <Notice kind="success">{copy.register.pendingTitle}</Notice>
        <p className="mt-4 text-sm leading-7 text-ink-muted">{copy.register.pendingBody}</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="grid min-w-0 gap-5 rounded-card border border-line bg-surface p-6 shadow-[var(--raak-shadow-subtle)] sm:grid-cols-2 sm:p-8">
      <label className="text-sm font-medium text-ink sm:col-span-2">
        {copy.register.legalName}
        <input name="legalName" required maxLength={200} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        {copy.register.displayName}
        <input name="displayName" required maxLength={120} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        {copy.register.slug}
        <input name="slug" required minLength={2} maxLength={63} dir="ltr" className={inputClass} />
        <span className="mt-1 block text-xs font-normal text-ink-muted">{copy.register.slugHint}</span>
      </label>
      <label className="text-sm font-medium text-ink">
        {copy.register.timezone}
        <select name="timezone" defaultValue="Asia/Riyadh" className={inputClass}>
          <option value="Asia/Riyadh">Asia/Riyadh</option>
          <option value="Asia/Dubai">Asia/Dubai</option>
          <option value="Asia/Kuwait">Asia/Kuwait</option>
        </select>
      </label>
      <label className="text-sm font-medium text-ink">
        {copy.register.currency}
        <select name="currency" defaultValue="SAR" className={inputClass}>
          <option value="SAR">SAR</option>
          <option value="AED">AED</option>
          <option value="KWD">KWD</option>
        </select>
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        {copy.register.supportEmail}
        <input name="supportEmail" type="email" required dir="ltr" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        {copy.register.ownerEmail}
        <input name="ownerEmail" type="email" required dir="ltr" autoComplete="email" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        {copy.register.ownerPassword}
        <input name="ownerPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} />
        <span className="mt-1 block text-xs font-normal text-ink-muted">{copy.register.passwordHint}</span>
      </label>
      {error ? <div className="sm:col-span-2"><Notice kind="error">{error}</Notice></div> : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? copy.common.working : copy.register.submit}
        </button>
      </div>
    </form>
  );
}

export function LoginForm({ locale, copy }: { locale: Locale; copy: AuthCopy }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [platform, setPlatform] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!isValidEmail(email)) return setError(copy.validation.email);
    if (!password) return setError(copy.validation.required);
    setError('');
    startTransition(async () => {
      try {
        const me = await apiRequest<{ principalType: string }>(
          '/auth/login',
          { method: 'POST', body: JSON.stringify({ email, password }) },
          window.location.hostname.startsWith('platform.') ? 'platform' : 'current',
        );
        setPlatform(me.principalType === 'PLATFORM_OPERATOR');
        setSuccess(true);
      } catch {
        setError(copy.validation.request);
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid min-w-0 gap-5 rounded-card border border-line bg-surface p-7 shadow-[var(--raak-shadow-subtle)] sm:p-9">
      <label className="text-sm font-medium text-ink">
        {copy.login.email}
        <input name="email" type="email" required dir="ltr" autoComplete="email" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink">
        {copy.login.password}
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {success ? <Notice kind="success">{copy.login.success}</Notice> : null}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? copy.common.working : copy.login.submit}
        </button>
        {platform ? <Link href={`/${locale}/platform/tenants`} className="text-sm font-semibold text-brand underline-offset-4 hover:underline">{copy.login.platformLink}</Link> : null}
      </div>
    </form>
  );
}

export function VerifyEmailForm({ copy }: { copy: AuthCopy }) {
  const capabilityToken = useCapabilityToken();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  function verify() {
    if (!capabilityToken) return;
    setMessage('');
    startTransition(async () => {
      try {
        await apiRequest('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: capabilityToken }) }, 'platform');
        clearCapabilityLocation();
        setSuccess(true);
        setMessage(copy.verify.success);
      } catch {
        setMessage(copy.validation.request);
      }
    });
  }
  return (
    <section className="rounded-card border border-line bg-surface p-7 shadow-[var(--raak-shadow-subtle)] sm:p-9">
      {message || !capabilityToken ? <Notice kind={success ? 'success' : 'error'}>{message || copy.verify.missing}</Notice> : null}
      <button type="button" onClick={verify} disabled={!capabilityToken || pending || success} className={`${buttonClass} mt-5`}>
        {pending ? copy.common.working : copy.verify.submit}
      </button>
    </section>
  );
}

export function ResetPasswordForm({ copy }: { copy: AuthCopy }) {
  const capabilityToken = useCapabilityToken();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capabilityToken) return;
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!isValidPassword(password)) return setMessage(copy.validation.password);
    setMessage('');
    startTransition(async () => {
      try {
        await apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: capabilityToken, newPassword: password }) }, 'platform');
        clearCapabilityLocation();
        setSuccess(true);
        setMessage(copy.reset.success);
      } catch {
        setMessage(copy.validation.request);
      }
    });
  }
  return (
    <form onSubmit={submit} className="grid gap-5 rounded-card border border-line bg-surface p-7 shadow-[var(--raak-shadow-subtle)] sm:p-9">
      <label className="text-sm font-medium text-ink">
        {copy.reset.password}
        <input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} />
      </label>
      {message || !capabilityToken ? <Notice kind={success ? 'success' : 'error'}>{message || copy.reset.missing}</Notice> : null}
      <button type="submit" disabled={!capabilityToken || pending || success} className={buttonClass}>
        {pending ? copy.common.working : copy.reset.submit}
      </button>
    </form>
  );
}

export function AcceptInvitationForm({ copy }: { copy: AuthCopy }) {
  const capabilityToken = useCapabilityToken();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capabilityToken) return;
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!isValidPassword(password)) return setMessage(copy.validation.password);
    setMessage('');
    startTransition(async () => {
      try {
        await apiRequest('/staff/invitations/accept', {
          method: 'POST',
          body: JSON.stringify({ token: capabilityToken, password }),
        });
        clearCapabilityLocation();
        setSuccess(true);
        setMessage(copy.invitation.success);
      } catch {
        setMessage(copy.validation.request);
      }
    });
  }
  return (
    <form onSubmit={submit} className="grid gap-5 rounded-card border border-line bg-surface p-7 shadow-[var(--raak-shadow-subtle)] sm:p-9">
      <label className="text-sm font-medium text-ink">
        {copy.invitation.password}
        <input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} />
      </label>
      {message || !capabilityToken ? <Notice kind={success ? 'success' : 'error'}>{message || copy.invitation.missing}</Notice> : null}
      <button type="submit" disabled={!capabilityToken || pending || success} className={buttonClass}>
        {pending ? copy.common.working : copy.invitation.submit}
      </button>
    </form>
  );
}
