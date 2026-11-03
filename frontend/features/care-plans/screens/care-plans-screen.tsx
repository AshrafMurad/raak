'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { Select } from '../../../components/ui/select';
import { StatusBadge } from '../../../components/ui/status-badge';
import { carePlanCopy, carePlanError, localizedPlanService } from '../copy';
import type { CarePlanStatusFilter } from '../contracts';
import { PlanDetail } from '../components/plan-detail';
import { PlanEditor, emptyPlanContent } from '../components/plan-editor';
import { carePlanStatusTone } from '../policies';
import { usePlanEditor } from '../hooks/use-plan-editor';
import { useCarePlans } from '../hooks/use-care-plans';
import '../care-plans.css';
import { useWorkspaceQuery } from '../../../lib/use-workspace-query';

export function CarePlansScreen({ locale }: { locale: Locale }) {
  const c = carePlanCopy(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const {
    plans,
    cursor,
    status,
    setStatus,
    loading,
    error: listError,
    load,
    refresh,
  } = useCarePlans();
  const { patients, services, caregivers, error: optionsError, create } = usePlanEditor();
  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [requestId, setRequestId] = useState('');
  const { search, update } = useWorkspaceQuery();
  const selectedId = new URLSearchParams(search).get('plan');
  const setSelectedId = (id: string | null) => update({ plan: id });
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (listError) setMessage(carePlanError(c, listError));
  }, [c, listError]);

  const loadPlans = useCallback(
    async (statusFilter = status, next?: string) => {
      await load(statusFilter as CarePlanStatusFilter | '', next);
    },
    [load, status],
  );

  useEffect(() => {
    if (optionsError) setMessage(carePlanError(c, optionsError));
  }, [c, optionsError]);

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
      } catch (error) {
        setMessage(carePlanError(c, error));
      }
    });
  }

  return (
    <>
      <div className="raak-scheduling raak-care-plans">
        <div className="rv-page-heading">
          <div>
            <h1>{c.carePlans}</h1>
            <p>{c.carePlansIntro}</p>
          </div>
          <Button
            onClick={() => {
              setSelectedId(null);
              setShowCreate((value) => !value);
            }}
          >
            {c.newPlan}
          </Button>
        </div>
        {message ? (
          <Feedback
            tone={
              message === c.saved ? 'success' : message === c.savedRefreshFailed ? 'info' : 'error'
            }
            title={message}
          />
        ) : null}
        {loading ? <Feedback title={c.loading} /> : null}
        <section className="raak-card">
          <div className="raak-scheduling-list-row">
            <Select
              id="plan-status"
              name="plan-status"
              label={c.status}
              dir={dir}
              value={status || 'ALL'}
              options={[
                { value: 'ALL', label: c.allStatuses },
                ...(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const).map(
                  (value) => ({ value, label: c.states[value] }),
                ),
              ]}
              onValueChange={(value) => {
                const nextStatus = value === 'ALL' ? '' : value;
                setStatus(nextStatus as CarePlanStatusFilter | '');
                setMessage('');
              }}
            />
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                refresh();
                setMessage('');
              }}
            >
              {c.refresh}
            </Button>
          </div>
          {!loading && plans.length === 0 ? <Feedback title={c.emptyPlans} /> : null}
          {plans.map((plan) => (
            <article className="raak-scheduling-list-row" key={plan.id}>
              <div className="raak-scheduling-meta">
                <strong>{plan.patient.displayName}</strong>
                <span> · {localizedPlanService(plan, locale)}</span>
                <span>
                  {' '}
                  · {c.version} {plan.currentVersion}
                </span>
                <span>
                  {' '}
                  · {c.plannedVisits}: {plan.plannedVisits}
                </span>
              </div>
              <StatusBadge tone={carePlanStatusTone(plan.status)}>
                {c.states[plan.status]}
              </StatusBadge>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false);
                  setSelectedId(plan.id);
                }}
              >
                {c.open}
              </Button>
            </article>
          ))}
          {cursor ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => loadPlans(status, cursor))}
            >
              {c.next}
            </Button>
          ) : null}
        </section>
        {showCreate ? (
          <section className="raak-card">
            <h2>{c.createPlan}</h2>
            <div className="raak-scheduling-grid">
              <div className="rv-field">
                <label htmlFor="create-patient">{c.patient}</label>
                <Select
                  id="create-patient"
                  name="patientId"
                  label={c.patient}
                  placeholder={c.patient}
                  dir={dir}
                  value={patientId}
                  options={patients.map((item) => ({
                    value: item.id,
                    label: item.displayName ?? item.id,
                  }))}
                  onValueChange={setPatientId}
                />
              </div>
              <div className="rv-field">
                <label htmlFor="create-service">{c.service}</label>
                <Select
                  id="create-service"
                  name="serviceId"
                  label={c.service}
                  placeholder={c.service}
                  dir={dir}
                  value={serviceId}
                  options={services.map((item) => ({
                    value: item.id,
                    label: locale === 'ar' ? item.config.nameAr : item.config.nameEn,
                  }))}
                  onValueChange={setServiceId}
                />
              </div>
              <label className="rv-field">
                <span>{c.requestId}</span>
                <input
                  className="rv-input raak-scheduling-code"
                  value={requestId}
                  onChange={(event) => setRequestId(event.target.value)}
                />
              </label>
            </div>
            <PlanEditor
              locale={locale}
              caregivers={caregivers}
              initial={emptyPlanContent()}
              submitLabel={c.createPlan}
              disabled={pending || !patientId || !serviceId}
              onSubmit={(content) =>
                run(async () => {
                  const created = await create(patientId, serviceId, requestId, content);
                  setSelectedId(created.id);
                  setShowCreate(false);
                  try {
                    await loadPlans();
                    setMessage(c.saved);
                  } catch {
                    setMessage(c.savedRefreshFailed);
                  }
                })
              }
            />
          </section>
        ) : null}
        {selectedId ? (
          <PlanDetail
            key={selectedId}
            locale={locale}
            planId={selectedId}
            caregivers={caregivers}
            onClose={() => setSelectedId(null)}
            onChanged={() => loadPlans()}
          />
        ) : null}
      </div>
    </>
  );
}
