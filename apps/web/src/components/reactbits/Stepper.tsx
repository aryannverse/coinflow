// Source: React Bits Stepper-TS-TW (reactbits.dev registry)
// (adapted: controlled step, completeButtonText, completedContent, accent token)
// Further changes, all for the onboarding flow:
//  - `step` is controlled by the parent; the internal currentStep state, onStepChange and click-to-jump are gone, so a
//    step can save before it advances (`onNext` / `onBack` do the navigating).
//  - theme/accentColor/width/indicator/frame/vertical props and the hard-coded palette are dropped; surfaces and the
//    progress bars use the design tokens (card, border, primary).
//  - the step indicators are decorative bars (aria-hidden); the accessible position is the visible "Step N of M" text.
//    Focus moves to the new step's [data-step-heading] on every step change, described by that text.
//  - only the entering pane animates (no duplicate "leaving" pane, which repeated ids and re-mounted effects); the
//    slide becomes a short opacity fade when motion is reduced.
//  - buttons are the shared Button (48px targets, press state); `busy` shows a pending spinner and ignores clicks.
'use client'

import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface StepProps {
  children?: ReactNode
  title?: string
}

export interface StepperProps {
  children?: ReactNode
  /** 1-based current step. `children.length + 1` shows `completedContent`. */
  step: number
  onNext: () => void
  onBack: () => void
  /** True while a step is saving: the Next button shows a spinner and ignores presses. */
  busy?: boolean
  backButtonText?: string
  nextButtonText?: string
  completeButtonText?: string
  completedContent?: ReactNode
  backButtonProps?: { className?: string }
  nextButtonProps?: { className?: string }
  className?: string
}

const SLIDE_PX = 36
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function Step({ children }: StepProps) {
  return <div className="min-w-0">{children}</div>
}

export default function Stepper({
  children,
  step,
  onNext,
  onBack,
  busy = false,
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  completeButtonText = 'Complete',
  completedContent,
  backButtonProps,
  nextButtonProps,
  className,
}: StepperProps) {
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<StepProps>[]
  const total = steps.length
  const current = Math.min(total + 1, Math.max(1, Math.round(step)))
  const completed = current > total
  const isLast = current === total
  const reduced = useReducedMotion()
  const countId = useId()
  const paneRef = useRef<HTMLDivElement>(null)
  const shownStep = useRef(current)

  useIsomorphicLayoutEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    // The step heading names the new step; the visible "Step N of M" text is read as its description.
    const heading = pane.querySelector<HTMLElement>('[data-step-heading]')
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
      if (!completed) heading.setAttribute('aria-describedby', countId)
    }
    if (shownStep.current === current) return // first render: nothing moved
    const direction = current > shownStep.current ? 1 : -1
    shownStep.current = current
    ;(heading ?? pane).focus({ preventScroll: true })
    if (typeof pane.animate !== 'function') return
    if (reduced) {
      pane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })
      return
    }
    pane.animate(
      [{ transform: `translateX(${direction * SLIDE_PX}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 360, easing: SETTLE },
    )
  }, [current, completed, countId, reduced])

  const title = completed ? undefined : steps[current - 1]?.props.title

  return (
    <div
      className={cn('flex w-full min-w-0 flex-col rounded-tile border bg-card p-5 text-card-foreground sm:p-8', className)}
      data-completed={completed ? '' : undefined}
    >
      {!completed && (
        <div className="flex flex-col gap-3">
          <p id={countId} className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <span>
              Step {current} of {total}
            </span>
            {title && (
              <>
                <span aria-hidden> · </span>
                <span> {title}</span>
              </>
            )}
          </p>
          <div aria-hidden className="flex gap-1.5">
            {steps.map((_, index) => (
              <span key={index} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <span
                  className={cn(
                    'absolute inset-0 origin-left rounded-full bg-primary',
                    !reduced && 'transition-transform duration-500 ease-out',
                    index < current ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
            ))}
          </div>
        </div>
      )}

      <div ref={paneRef} key={current} tabIndex={-1} className={cn('min-w-0 outline-none', !completed && 'mt-6')}>
        {completed ? completedContent : steps[current - 1]}
      </div>

      {!completed && (
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            className={cn('min-h-12 min-w-12 gap-1.5 rounded-chip px-4 text-base active:scale-[0.97]', current <= 1 && 'invisible', backButtonProps?.className)}
            onClick={onBack}
          >
            <ArrowLeft aria-hidden />
            <span>{backButtonText}</span>
          </Button>
          <Button
            type="button"
            aria-disabled={busy || undefined}
            className={cn('ml-auto min-h-12 min-w-12 gap-1.5 rounded-chip px-5 text-base active:scale-[0.97] aria-disabled:opacity-70', nextButtonProps?.className)}
            onClick={() => {
              if (!busy) onNext()
            }}
          >
            <span>{isLast ? completeButtonText : nextButtonText}</span>
            {busy ? <LoaderCircle aria-hidden className={reduced ? undefined : 'animate-spin'} /> : isLast ? <Check aria-hidden /> : <ArrowRight aria-hidden />}
          </Button>
        </div>
      )}
    </div>
  )
}
