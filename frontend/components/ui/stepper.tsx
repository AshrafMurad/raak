export function Stepper({
  steps,
  current,
  label,
}: {
  steps: readonly string[];
  current: number;
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="raak-stepper">
        {steps.map((step, i) => (
          <li key={step} aria-current={current === i ? 'step' : undefined}>
            <span aria-hidden="true">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </nav>
  );
}
