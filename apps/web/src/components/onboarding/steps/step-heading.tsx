/** Every step's title. The Stepper moves focus here on step change and describes it with "Step N of M". */
export function StepHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 data-step-heading tabIndex={-1} className="font-display text-2xl font-bold outline-none sm:text-3xl">
      {children}
    </h1>
  )
}
