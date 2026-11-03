import { describe, expect, it } from 'vitest';
import { createRequestGeneration } from '../features/care-plans/request-generation';

describe('care-plan request generation', () => {
  it('invalidates older responses when a newer load starts', () => {
    const requests = createRequestGeneration();
    const older = requests.next();
    const newer = requests.next();

    expect(requests.isCurrent(older)).toBe(false);
    expect(requests.isCurrent(newer)).toBe(true);
  });

  it('invalidates pending responses when a detail view unmounts', () => {
    const requests = createRequestGeneration();
    const pending = requests.next();

    requests.invalidate();

    expect(requests.isCurrent(pending)).toBe(false);
  });
});
