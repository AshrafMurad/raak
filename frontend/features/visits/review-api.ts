import { apiRequest } from '../../lib/api-client';
import { arrayOf, flag, nullable, objectOf, text } from '../../lib/response-validation';
const notes = objectOf({
  reviewStatus: text,
  reviews: arrayOf(
    objectOf({ id: text, reviewerId: text, noteRestricted: nullable(text), createdAt: text }),
  ),
  notes: arrayOf(
    objectOf({
      id: text,
      authorId: text,
      bodyRestricted: text,
      isDraft: flag,
      isAddendum: flag,
      parentNoteId: nullable(text),
      reason: nullable(text),
      finalizedAt: nullable(text),
      createdAt: text,
    }),
  ),
});
export type VisitDocumentation = ReturnType<typeof notes>;
export function getVisitDocumentation(id: string) {
  return apiRequest(`/agency/visits/${encodeURIComponent(id)}/notes`).then(notes);
}
export function reviewVisit(id: string, expectedVersion: number, note: string) {
  return apiRequest(`/agency/visits/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, ...(note.trim() ? { note } : {}) }),
  });
}
export function correctVisit(
  id: string,
  expectedVersion: number,
  body: string,
  reason: string,
  parentNoteId: string | null,
) {
  return apiRequest(`/agency/visits/${encodeURIComponent(id)}/corrections`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, body, reason, parentNoteId }),
  });
}
