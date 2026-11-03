/** A committed command and a failed read-back are distinct outcomes. */
export async function runConfirmedCommand(
  command: () => Promise<void>,
  refreshes: Array<() => Promise<unknown>>,
): Promise<{ refreshFailed: boolean }> {
  await command();
  const results = await Promise.allSettled(
    refreshes.map((refresh) => Promise.resolve().then(refresh)),
  );
  return { refreshFailed: results.some((result) => result.status === 'rejected') };
}
