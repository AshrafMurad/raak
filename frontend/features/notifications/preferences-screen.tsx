'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { Button } from '../../components/ui/button';
import { CheckboxField } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { PortalFrame } from '../../components/layout/portal-frame';
import {
  getPolicies,
  getPreferences,
  savePolicies,
  savePreferences,
  type Policy,
  type Preference,
} from './api';
import { notificationCopy, notificationError } from './copy';
import '../../components/layout/visit-flow.css';

export function PreferencesScreen({
  locale,
  agency = false,
  workspace = false,
}: {
  locale: Locale;
  agency?: boolean;
  workspace?: boolean;
}) {
  const c = notificationCopy(locale);
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [preferences, setPreferences] = useState<Preference[] | null>(null);
  const [version, setVersion] = useState(0);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success'>('error');
  const [pending, start] = useTransition();
  useEffect(() => {
    const controller = new AbortController();
    const load = agency
      ? getPolicies(controller.signal).then((data) => {
          if (!controller.signal.aborted) {
            setPolicies(data.policies);
            setVersion(data.version);
          }
        })
      : getPreferences(controller.signal).then((data) => {
          if (!controller.signal.aborted) setPreferences(data.preferences);
        });
    void load.catch((e: unknown) => {
      if (!controller.signal.aborted) {
        setTone('error');
        setMessage(notificationError(c, e));
      }
    });
    return () => controller.abort();
  }, [agency, revision, c]);
  const content = (
    <section className="raak-execution">
      <div className="rv-page-heading">
        <div>
          <h1>{agency ? c.policy : c.preferences}</h1>
          <p>{agency ? c.policyIntro : c.preferencesIntro}</p>
        </div>
      </div>
      <Link href={`/${locale}/${workspace ? 'workspace/' : ''}notifications`}>{c.title}</Link>
      {message ? <Feedback title={message} tone={tone} /> : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setMessage('');
          setRevision((r) => r + 1);
        }}
      >
        {c.refresh}
      </Button>
      {!(agency ? policies : preferences) && !message ? <Feedback title={c.loading} /> : null}
      {(agency ? policies : preferences) ? (
        <form
          className="raak-form"
          aria-busy={pending}
          onSubmit={(e) => {
            e.preventDefault();
            setMessage('');
            start(async () => {
              try {
                if (agency && policies) setVersion((await savePolicies(version, policies)).version);
                else if (preferences)
                  await savePreferences(
                    preferences.map(({ eventType, channel, optedOut }) => ({
                      eventType,
                      channel,
                      optedOut,
                    })),
                  );
                setTone('success');
                setMessage(c.saved);
              } catch (error) {
                setTone('error');
                setMessage(notificationError(c, error));
              }
            });
          }}
        >
          {agency
            ? policies?.map((cell, index) => (
                <div className="raak-card" key={`${cell.eventType}:${cell.channel}`}>
                  <CheckboxField
                    id={`${cell.eventType}-${cell.channel}`}
                    name={`${cell.eventType}-${cell.channel}`}
                    autoComplete="off"
                    label={`${c.events[cell.eventType]} — ${c[cell.channel]}${cell.configurable ? '' : ` (${c.locked})`}`}
                    checked={cell.enabled}
                    disabled={pending || !cell.configurable}
                    onChange={(e) =>
                      setPolicies(
                        (rows) =>
                          rows?.map((p, i) =>
                            i === index ? { ...p, enabled: e.target.checked } : p,
                          ) ?? null,
                      )
                    }
                  />
                </div>
              ))
            : preferences?.map((cell, index) => (
                <div className="raak-card" key={`${cell.eventType}:${cell.channel}`}>
                  <CheckboxField
                    id={`${cell.eventType}-${cell.channel}`}
                    name={`${cell.eventType}-${cell.channel}`}
                    autoComplete="off"
                    label={`${c.events[cell.eventType]} — ${c[cell.channel]}`}
                    checked={!cell.optedOut}
                    disabled={pending}
                    onChange={(e) =>
                      setPreferences(
                        (rows) =>
                          rows?.map((p, i) =>
                            i === index ? { ...p, optedOut: !e.target.checked } : p,
                          ) ?? null,
                      )
                    }
                  />
                  {!cell.tenantEnabled ? <p>{c.tenantDisabled}</p> : null}
                </div>
              ))}
          <Button type="submit" disabled={pending}>
            {c.save}
          </Button>
        </form>
      ) : null}
    </section>
  );
  return workspace ? (
    content
  ) : (
    <PortalFrame locale={locale} path="/notifications/preferences">
      {content}
    </PortalFrame>
  );
}
