'use client';
import { useState } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/dialog';
import { visitCopy, formatVisitDateTime } from '../copy';
import type { VisitChange } from '../changes-api';

/** Coordinator approval commits a booking change, so its consequence is
 * confirmed explicitly before the mutation is sent. */
export function ChangeApprovalDialog({
  change,
  locale,
  pending,
  onApprove,
}: {
  change: VisitChange;
  locale: Locale;
  pending: boolean;
  onApprove(): void;
}) {
  const c = visitCopy(locale);
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <Button
        disabled={pending}
        onClick={(event) => {
          setOpener(event.currentTarget);
          setOpen(true);
        }}
      >
        {c.changes.approve}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener?.focus();
          }}
        >
          <header className="rv-dialog-header">
            <div>
              <DialogTitle>{c.changes.approve}</DialogTitle>
              <DialogDescription>
                {change.type === 'CANCEL' ? c.changes.confirmCancel : c.changes.confirmReschedule}
              </DialogDescription>
            </div>
          </header>
          <div className="rv-dialog-body">
            <p>{change.visit.patient.displayName}</p>
            <p>
              {c.changes.currentWindow}:{' '}
              {formatVisitDateTime(
                change.visit.scheduledStartUtc,
                locale,
                change.visit.timezoneSnapshot,
              )}
            </p>
            {change.proposedStartUtc ? (
              <p>
                {c.changes.proposedWindow}:{' '}
                {formatVisitDateTime(
                  change.proposedStartUtc,
                  locale,
                  change.visit.timezoneSnapshot,
                )}
              </p>
            ) : null}
            <p>{c.changes.approveHelp}</p>
          </div>
          <footer className="rv-dialog-footer">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {c.close}
            </Button>
            <Button
              variant={change.type === 'CANCEL' ? 'danger' : 'primary'}
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onApprove();
              }}
            >
              {c.changes.confirm}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
