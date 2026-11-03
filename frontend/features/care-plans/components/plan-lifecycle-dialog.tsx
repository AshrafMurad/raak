'use client';

import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Field, Textarea } from '../../../components/ui/field';
import { Feedback } from '../../../components/ui/feedback';
import { Select } from '../../../components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog';
import { carePlanCopy } from '../copy';
import { validateLifecycleReason } from '../validation';

export type LifecycleAction = 'pause' | 'resume' | 'complete' | 'cancel';

export function PlanLifecycleDialog({
  locale,
  action,
  reason,
  disposition,
  pending,
  onReasonChange,
  onDispositionChange,
  onClose,
  onConfirm,
}: {
  locale: Locale;
  action: LifecycleAction | null;
  reason: string;
  disposition: 'KEEP' | 'CANCEL';
  pending: boolean;
  onReasonChange(reason: string): void;
  onDispositionChange(disposition: 'KEEP' | 'CANCEL'): void;
  onClose(): void;
  onConfirm(): void;
}) {
  const c = carePlanCopy(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const reasonError =
    action && reason.length > 0 ? validateLifecycleReason(action, reason, disposition) : null;
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent dir={dir}>
        <div className="rv-dialog-header">
          <div>
            <DialogTitle>{c.lifecycleTitle}</DialogTitle>
            <DialogDescription>
              {action === 'pause'
                ? c.pauseDispositionHint
                : action === 'cancel'
                  ? c.cancelDispositionHint
                  : action === 'complete'
                    ? c.completeDispositionHint
                    : c.resumeHint}
            </DialogDescription>
          </div>
        </div>
        <div className="rv-dialog-body raak-scheduling-dialog-form">
          {action !== 'resume' ? (
            <Field
              id="lifecycle-reason"
              label={c.reason}
              error={reasonError ? c.validation : undefined}
            >
              <Textarea
                id="lifecycle-reason"
                aria-invalid={!!reasonError}
                aria-describedby={reasonError ? 'lifecycle-reason-error' : undefined}
                minLength={5}
                maxLength={300}
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
              />
            </Field>
          ) : null}
          {action === 'pause' || action === 'cancel' ? (
            <Field id="future-disposition" label={c.futureDisposition}>
              <Select
                id="future-disposition"
                name="futureDisposition"
                label={c.futureDisposition}
                dir={dir}
                value={disposition}
                options={[
                  { value: 'KEEP', label: c.keepFuture },
                  { value: 'CANCEL', label: c.cancelFuture },
                ]}
                onValueChange={(value) => onDispositionChange(value as 'KEEP' | 'CANCEL')}
              />
            </Field>
          ) : null}
          <Feedback title={c.scheduledKept} />
        </div>
        <div className="rv-dialog-footer">
          <DialogClose asChild>
            <Button variant="secondary">{c.close}</Button>
          </DialogClose>
          <Button
            variant={action === 'cancel' ? 'danger' : 'primary'}
            disabled={
              pending || !action || validateLifecycleReason(action, reason, disposition) !== null
            }
            onClick={onConfirm}
          >
            {c.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
