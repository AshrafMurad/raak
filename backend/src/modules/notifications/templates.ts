import type { NotificationEvent } from '../../contracts/notifications';
import ar from './messages/ar.json';
import en from './messages/en.json';

export interface TemplateContext { locale: 'ar' | 'en'; agencyName: string; url: string }

/** Only trusted configured tenant hosts and allowlisted application destinations. */
export function tenantNotificationUrl(input: {
  baseDomain: string; slug: string; locale: 'ar' | 'en'; path: string;
  production: boolean; port?: number;
}) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(input.baseDomain) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) ||
      !/^\/(?:notifications|track|account|my\/visits|caregiver\/visits|workspace\/(?:visits|requests(?:\/[a-f0-9-]+)?|caregivers))(?:\?(?:visit|request|caregiver)=[a-f0-9-]+)?$/.test(input.path) ||
      (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)))
    throw new Error('NOTIFICATION_LINK_INVALID');
  return `${input.production ? 'https' : 'http'}://${input.slug}.${input.baseDomain}${input.port ? `:${input.port}` : ''}/${input.locale}${input.path}`;
}

export function renderNotification(event: NotificationEvent, context: TemplateContext) {
  const copy = context.locale === 'en' ? en : ar;
  // This label is public branding, never a subject/header or HTML interpolation.
  const name = Array.from(context.agencyName, (char) => {
    const code = char.codePointAt(0)!;
    return code < 32 || code === 127 || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) ? ' ' : char;
  }).join('').slice(0, 120);
  const isolate = (text: string, direction: string) => `${direction}${text}\u2069`;
  return {
    subject: copy[event],
    text: `${copy[event]}\n\n${isolate(name, '\u2068')}\n${copy.cta}\n${isolate(context.url, '\u2066')}`,
  };
}
