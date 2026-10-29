'use client';

import { useEffect, useState, useTransition } from 'react';
import { apiRequest, ApiRequestError } from '../../../lib/api-client';
import { isValidSuspendReason } from '../../../lib/form-validation';
import type { Dictionary } from '../../../lib/i18n';

type TenantStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';
interface TenantSummary {
  tenantId: string;
  slug: string;
  displayName: string;
  status: TenantStatus;
  counts: { owners: number; staff: number; customers: number };
}

type PlatformCopy = Dictionary['platform'];
type Action = { kind: 'activate' | 'suspend'; tenant: TenantSummary };

const statusClasses: Record<TenantStatus, string> = {
  PENDING_APPROVAL: 'border-amber-300 bg-amber-50 text-[var(--raak-status-warning)]',
  ACTIVE: 'border-emerald-300 bg-emerald-50 text-[var(--raak-status-success)]',
  SUSPENDED: 'border-red-300 bg-red-50 text-[var(--raak-status-danger)]',
};

function StatusChip({ status, copy }: { status: TenantStatus; copy: PlatformCopy }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {copy.status[status]}
    </span>
  );
}

export function TenantAdmin({ copy }: { copy: PlatformCopy }) {
  const [items, setItems] = useState<TenantSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unauthorized'>('loading');
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  async function load() {
    setState('loading');
    try {
      const page = await apiRequest<{ items: TenantSummary[] }>('/platform/tenants?limit=100', {}, 'platform');
      setItems(page.items);
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiRequestError && error.status === 401 ? 'unauthorized' : 'error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function confirmAction() {
    if (!action) return;
    if (action.kind === 'suspend' && !isValidSuspendReason(reason)) return;
    setNotice('');
    startTransition(async () => {
      try {
        await apiRequest(
          `/platform/tenants/${action.tenant.tenantId}/${action.kind}`,
          { method: 'POST', body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}) },
          'platform',
        );
        setAction(null);
        setReason('');
        setNotice(copy.actions.success);
        await load();
      } catch {
        setNotice(copy.actions.failure);
      }
    });
  }

  function actionsFor(tenant: TenantSummary) {
    return (
      <div className="flex flex-wrap gap-2">
        {tenant.status !== 'ACTIVE' ? (
          <button type="button" onClick={() => setAction({ kind: 'activate', tenant })} className="rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-subtle">
            {copy.actions.activate}
          </button>
        ) : null}
        {tenant.status === 'ACTIVE' ? (
          <button type="button" onClick={() => setAction({ kind: 'suspend', tenant })} className="rounded-lg border border-[var(--raak-status-danger)] px-3 py-1.5 text-xs font-semibold text-[var(--raak-status-danger)] hover:bg-red-50">
            {copy.actions.suspend}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-[var(--raak-shadow-subtle)] sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{items.length} / 100</p>
        <button type="button" onClick={() => void load()} disabled={state === 'loading'} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-subtle disabled:opacity-60">
          {copy.refresh}
        </button>
      </div>
      {notice ? <p role="status" className="mb-4 rounded-lg bg-brand-subtle px-4 py-3 text-sm text-brand">{notice}</p> : null}
      {state === 'loading' ? <p className="py-12 text-center text-sm text-ink-muted">{copy.loading}</p> : null}
      {state === 'error' ? <p role="alert" className="py-12 text-center text-sm text-[var(--raak-status-danger)]">{copy.error}</p> : null}
      {state === 'unauthorized' ? <p role="alert" className="py-12 text-center text-sm text-[var(--raak-status-danger)]">{copy.loginRequired}</p> : null}
      {state === 'ready' && items.length === 0 ? <p className="py-12 text-center text-sm text-ink-muted">{copy.empty}</p> : null}

      {state === 'ready' && items.length > 0 ? (
        <>
          <div className="grid gap-4 sm:hidden">
            {items.map((tenant) => (
              <article key={tenant.tenantId} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-semibold text-ink">{tenant.displayName}</h2><p className="mt-1 text-xs text-ink-muted" dir="ltr">{tenant.slug}</p></div>
                  <StatusChip status={tenant.status} copy={copy} />
                </div>
                <p className="my-4 text-xs leading-6 text-ink-muted">
                  {tenant.counts.owners} {copy.counts.owners} · {tenant.counts.staff} {copy.counts.staff} · {tenant.counts.customers} {copy.counts.customers}
                </p>
                {actionsFor(tenant)}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] border-collapse text-start text-sm">
              <thead><tr className="border-b border-line text-xs font-semibold text-ink-muted"><th className="px-3 py-3 text-start">{copy.table.agency}</th><th className="px-3 py-3 text-start">{copy.table.workspace}</th><th className="px-3 py-3 text-start">{copy.table.status}</th><th className="px-3 py-3 text-start">{copy.table.accounts}</th><th className="px-3 py-3 text-start">{copy.table.actions}</th></tr></thead>
              <tbody>{items.map((tenant) => <tr key={tenant.tenantId} className="border-b border-line last:border-0"><td className="px-3 py-4 font-semibold text-ink">{tenant.displayName}</td><td className="px-3 py-4 text-ink-muted" dir="ltr">{tenant.slug}</td><td className="px-3 py-4"><StatusChip status={tenant.status} copy={copy} /></td><td className="px-3 py-4 text-xs leading-6 text-ink-muted">{tenant.counts.owners} {copy.counts.owners}<br />{tenant.counts.staff} {copy.counts.staff}<br />{tenant.counts.customers} {copy.counts.customers}</td><td className="px-3 py-4">{actionsFor(tenant)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      ) : null}

      {action ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="tenant-action-title">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl">
            <h2 id="tenant-action-title" className="text-xl font-bold text-brand">{action.kind === 'activate' ? copy.actions.confirmActivate : copy.actions.confirmSuspend}</h2>
            <p className="mt-2 text-sm text-ink-muted">{action.tenant.displayName}</p>
            <label className="mt-5 block text-sm font-medium text-ink">{copy.actions.reason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-28 w-full rounded-lg border border-line p-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand-subtle" /></label>
            <p className="mt-1 text-xs text-ink-muted">{copy.actions.reasonHint}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => { setAction(null); setReason(''); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink">{copy.actions.cancel}</button><button type="button" onClick={confirmAction} disabled={pending || (action.kind === 'suspend' && !isValidSuspendReason(reason))} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? '…' : action.kind === 'activate' ? copy.actions.submitActivate : copy.actions.submitSuspend}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
