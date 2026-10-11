import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Label + input + optional hint + inline error. The error is a role="alert" paragraph tied to the input with
 * aria-describedby/aria-invalid, so it is announced and read with the field. Errors use the neutral tone, never red.
 */
export function LabeledInput({
  id,
  label,
  hint,
  error,
  className,
  ...rest
}: Omit<React.ComponentProps<'input'>, 'id'> & { id: string; label: string; hint?: string; error?: string }) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn('min-h-12 aria-invalid:border-neutral-negative aria-invalid:ring-neutral-negative/30', className)}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-neutral-negative">
          {error}
        </p>
      )}
    </div>
  )
}
