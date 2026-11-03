import { expect, it, vi } from 'vitest';
import { runConfirmedCommand } from '../lib/confirmed-command';

it('keeps a confirmed command successful when its read-back fails', async () => {
  const command = vi.fn().mockResolvedValue(undefined);
  expect(
    await runConfirmedCommand(command, [
      async () => {
        throw new Error('offline');
      },
    ]),
  ).toEqual({ refreshFailed: true });
  expect(command).toHaveBeenCalledTimes(1);
});

it('does not refresh or claim success when the command fails', async () => {
  const refresh = vi.fn();
  await expect(
    runConfirmedCommand(async () => {
      throw new Error('denied');
    }, [refresh]),
  ).rejects.toThrow('denied');
  expect(refresh).not.toHaveBeenCalled();
});
