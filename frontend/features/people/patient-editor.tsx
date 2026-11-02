'use client';
import { useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Field, Input, Textarea } from '../../components/ui/field';
import { Button } from '../../components/ui/button';
import { Feedback } from '../../components/ui/feedback';
import { peopleCopy, peopleError } from './copy';
import type { Patient, PatientProfile } from './contracts';

const empty: PatientProfile = {
  displayName: '',
  dateOfBirth: null,
  contact: '',
  areaId: '',
  addressRestricted: '',
  notesRestricted: '',
};
export function PatientEditor({
  locale,
  patient,
  request,
  onSaved,
}: {
  locale: Locale;
  patient?: Patient;
  request?: { id: string; version: number; beneficiaryName: string; areaId: string };
  onSaved(): void;
}) {
  const c = peopleCopy(locale);
  const [profile, setProfile] = useState<PatientProfile>(
    patient
      ? {
          displayName: patient.displayName,
          dateOfBirth: patient.dateOfBirth,
          contact: patient.contact,
          areaId: patient.areaId,
          addressRestricted: patient.addressRestricted,
          notesRestricted: patient.notesRestricted,
        }
      : request
        ? { ...empty, displayName: request.beneficiaryName, areaId: request.areaId }
        : empty,
  );
  const [candidates, setCandidates] = useState<{ id: string; displayName: string }[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const update = (key: keyof PatientProfile, value: string) => {
    setProfile((p) => ({ ...p, [key]: key === 'dateOfBirth' ? value || null : value }));
    setCandidates(null);
    setReasons({});
  };
  function check() {
    start(async () => {
      try {
        const result = await apiRequest<{ items: { id: string; displayName: string }[] }>(
          '/agency/patients/duplicates/check',
          { method: 'POST', body: JSON.stringify(profile) },
        );
        setCandidates(result.items);
        setMessage('');
      } catch (error) {
        setMessage(peopleError(c, error));
      }
    });
  }
  return (
    <form
      className="raak-card raak-form"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          try {
            const path = patient
              ? `/agency/patients/${patient.id}`
              : request
                ? `/agency/requests/${request.id}/create-patient`
                : '/agency/patients';
            await apiRequest(path, {
              method: patient ? 'PATCH' : 'POST',
              body: JSON.stringify({
                profile,
                ...(patient
                  ? { expectedVersion: patient.version }
                  : {
                      duplicateReviews: (candidates ?? []).map((candidate) => ({
                        candidateId: candidate.id,
                        reason: reasons[candidate.id] ?? '',
                      })),
                      ...(request ? { expectedVersion: request.version } : {}),
                    }),
              }),
            });
            setMessage('');
            onSaved();
          } catch (error) {
            setMessage(peopleError(c, error));
          }
        });
      }}
    >
      <h2>{patient ? c.editPatient : c.newPatient}</h2>
      {message ? <Feedback tone="error" title={message} /> : null}
      {(
        [
          'displayName',
          'dateOfBirth',
          'contact',
          'areaId',
          'addressRestricted',
          'notesRestricted',
        ] as const
      ).map((key) => {
        const labels = {
          displayName: c.name,
          dateOfBirth: c.dateOfBirth,
          contact: c.contact,
          areaId: c.area,
          addressRestricted: c.address,
          notesRestricted: c.notes,
        };
        const id = `patient-${key}`;
        return (
          <Field key={key} id={id} label={labels[key]}>
            {key === 'notesRestricted' || key === 'addressRestricted' ? (
              <Textarea
                id={id}
                value={profile[key]}
                maxLength={500}
                onChange={(e) => update(key, e.target.value)}
              />
            ) : (
              <Input
                id={id}
                required={key === 'displayName' || key === 'areaId'}
                type={key === 'dateOfBirth' ? 'date' : 'text'}
                value={profile[key] ?? ''}
                maxLength={key === 'contact' ? 254 : 120}
                onChange={(e) => update(key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
      {!patient ? (
        <>
          <p>{c.duplicateHelp}</p>
          <Button type="button" variant="secondary" disabled={pending} onClick={check}>
            {c.duplicateCheck}
          </Button>
          {candidates?.length === 0 ? <Feedback title={c.duplicateNone} /> : null}
          {candidates?.map((candidate) => (
            <Field
              key={candidate.id}
              id={`duplicate-${candidate.id}`}
              label={`${candidate.displayName} — ${c.ignoreReason}`}
            >
              <Input
                id={`duplicate-${candidate.id}`}
                required
                minLength={5}
                maxLength={300}
                value={reasons[candidate.id] ?? ''}
                onChange={(e) => setReasons((r) => ({ ...r, [candidate.id]: e.target.value }))}
              />
            </Field>
          ))}
        </>
      ) : null}
      <Button type="submit" disabled={pending || (!patient && candidates === null)}>
        {pending ? c.loading : c.save}
      </Button>
    </form>
  );
}
