export function createRequestGeneration() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (generation: number) => generation === current,
    invalidate: () => {
      current += 1;
    },
  };
}
