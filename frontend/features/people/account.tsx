'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { CatalogFrame } from '../catalog/frame';
import { peopleCopy, peopleError } from './copy';
import './people.css';

export function CustomerAccount({ locale }: { locale: Locale }) {
  const c = peopleCopy(locale);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [reference, setReference] = useState('');
  const [token, setToken] = useState('');
  const [requestId, setRequestId] = useState('');
  const [purpose, setPurpose] = useState('VERIFY_EMAIL');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    const consumeFragment = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const code = fragment.get('token');
      if (code) {
        setToken(code);
        setPurpose(fragment.get('purpose') ?? 'VERIFY_EMAIL');
        setRequestId(fragment.get('request') ?? '');
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    consumeFragment();
    window.addEventListener('hashchange', consumeFragment);
    return () => window.removeEventListener('hashchange', consumeFragment);
  }, []);
  function action(path: string, body: object, success: string) {
    start(async () => {
      setMessage('');
      setFailed(false);
      try {
        await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
        setMessage(success);
        if (path.endsWith('/verify-email') || path.endsWith('/claim')) setToken('');
        if (path.endsWith('/register')) setPassword('');
        if (path.endsWith('/login')) setLoginPassword('');
      } catch (error) {
        setFailed(true);
        setMessage(peopleError(c, error));
      }
    });
  }
  return (
    <CatalogFrame locale={locale} path="/account">
      <div className="raak-people">
        <h1>{c.account}</h1>
        <nav className="raak-actions">
          <a href="#customer-login">{c.login}</a>
          <Link href={`/${locale}/my/patients`}>{c.authorizedPatients}</Link>
        </nav>
        {message ? <Feedback tone={failed ? 'error' : 'success'} title={message} /> : null}
        <form
          className="raak-card raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            action('/portal/accounts/register', { email, password, locale }, c.verificationSent);
          }}
        >
          <h2>{c.register}</h2>
          <Field id="customer-email" label={c.email}>
            <Input
              id="customer-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field id="customer-password" label={c.password}>
            <Input
              id="customer-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? c.loading : c.register}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !email}
            onClick={() =>
              action('/portal/accounts/resend-verification', { email, locale }, c.verificationSent)
            }
          >
            {c.resend}
          </Button>
        </form>
        <form
          id="customer-login"
          className="raak-card raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            action(
              '/portal/accounts/login',
              { email: loginEmail, password: loginPassword },
              c.signedIn,
            );
          }}
        >
          <h2>{c.login}</h2>
          <Field id="customer-login-email" label={c.email}>
            <Input
              id="customer-login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
          </Field>
          <Field id="customer-login-password" label={c.password}>
            <Input
              id="customer-login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {c.login}
          </Button>
        </form>
        <form
          className="raak-card raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            action('/portal/accounts/claim-link', { reference, locale }, c.verificationSent);
          }}
        >
          <h2>{c.claimLink}</h2>
          <p>{c.claimHelp}</p>
          <Field id="claim-reference" label={c.reference}>
            <Input
              id="claim-reference"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {c.claimLink}
          </Button>
        </form>
        <form
          className="raak-card raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            action(
              purpose === 'CLAIM_REQUEST'
                ? `/portal/my/requests/${requestId}/claim`
                : '/portal/accounts/verify-email',
              { token },
              purpose === 'CLAIM_REQUEST' ? c.claimed : c.verified,
            );
          }}
        >
          <h2>{purpose === 'CLAIM_REQUEST' ? c.claim : c.verify}</h2>
          {purpose === 'CLAIM_REQUEST' ? (
            <Field id="claim-request" label={c.requestId}>
              <Input
                id="claim-request"
                required
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                dir="ltr"
              />
            </Field>
          ) : null}
          <Field id="customer-token" label={c.token}>
            <Input
              id="customer-token"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              dir="ltr"
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {purpose === 'CLAIM_REQUEST' ? c.claim : c.verify}
          </Button>
        </form>
      </div>
    </CatalogFrame>
  );
}
