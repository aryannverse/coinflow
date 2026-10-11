'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import Stepper, { Step } from '@/components/reactbits/Stepper'
import { useCheckin, useMe, useUpdateMe } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { MeDTO } from '@/lib/api-types'
import { paiseToRupeeString } from '@/lib/money'
import { fieldTarget, LAST_STEP, planStep, resumeStep, type FieldIssue, type OnboardingValues } from '@/lib/onboarding'
import { BalanceStep } from './steps/balance'
import { BillsStep } from './steps/bills'
import { DoneStep } from './steps/done'
import { FixedCostsStep } from './steps/fixed-costs'
import { IncomeStep } from './steps/income'
import { UpiStep } from './steps/upi'
import { WelcomeStep } from './steps/welcome'

const money = (paise: number | null) => (paise ? paiseToRupeeString(paise) : '')

/** Steps whose Enter key means Continue. Bills hosts its own form; Done's Enter is the focused button. */
const ENTER_CONTINUES = new Set([1, 2, 3, 5, 6])
const BILLS_STEP = 4

export function OnboardingFlow({ me }: { me: MeDTO }) {
  const router = useRouter()
  // Seeded with the server's copy; an upload or save refreshes it, and every patch is diffed against it.
  const { data: saved = me } = useMe(me)
  const updateMe = useUpdateMe({ inlineFieldErrors: true })
  const checkin = useCheckin()
  const [step, setStep] = useState(() => resumeStep(me.onboardingStep))
  const [values, setValues] = useState<OnboardingValues>(() => ({
    name: me.name,
    income: me.monthlyIncome == null ? '' : paiseToRupeeString(me.monthlyIncome),
    payday: String(me.paydayDay),
    balance: '',
    fixed: money(me.fixedCostsEstimate),
    upiId: me.upiId ?? '',
  }))
  const [issue, setIssue] = useState<FieldIssue | null>(null)
  const [lastCheckin, setLastCheckin] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [celebrated, setCelebrated] = useState(false)
  const [billsOpen, setBillsOpen] = useState(false)

  const set = (key: keyof OnboardingValues) => (value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setIssue(null)
  }
  const errorOn = (field: string) => (issue?.field === field ? issue.message : undefined)
  const formError = issue && !fieldTarget(issue.field) ? issue.message : null

  /** Show the message beside its field and move focus there, so it is read in context. */
  function showIssue(next: FieldIssue) {
    flushSync(() => setIssue(next))
    const target = fieldTarget(next.field)
    if (target) document.getElementById(target)?.focus()
  }

  /** Save only this step's changes, then move on. A failure keeps the user here with the reason. */
  async function advance() {
    if (saving || leaving) return
    setIssue(null)
    // An open bill form has not been saved; moving on would drop it without a word.
    if (step === BILLS_STEP && billsOpen) return showIssue({ field: 'bills', message: 'Add this bill or choose Never mind first.' })
    const planned = planStep(step, values, saved, lastCheckin)
    if (!planned.ok) return showIssue(planned.issue)
    setSaving(true)
    try {
      if (planned.checkin !== null) {
        await checkin.mutateAsync({ amount: planned.checkin })
        setLastCheckin(planned.checkin)
      }
      if (Object.keys(planned.patch).length > 0) await updateMe.mutateAsync(planned.patch)
      setStep(step + 1)
    } catch (err) {
      // Errors with a field are shown inline (the hooks stay quiet for them); the rest were toasted by the hooks.
      if (err instanceof ApiError && err.field) showIssue({ field: err.field, message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function leave(patch: { onboarded: true; onboardingStep?: number }) {
    if (saving || leaving) return
    setSaving(true)
    try {
      await updateMe.mutateAsync(patch)
      setLeaving(true)
      router.replace('/home')
    } catch {
      // The hook already told the user; they stay here and can try again.
    } finally {
      setSaving(false)
    }
  }

  const finish = () => leave({ onboarded: true, ...(saved.onboardingStep === LAST_STEP ? {} : { onboardingStep: LAST_STEP }) })
  const skip = () => leave({ onboarded: true })

  function back() {
    if (saving) return
    setIssue(null)
    if (step === LAST_STEP) setCelebrated(true) // the burst happens once
    setBillsOpen(false) // only the current step is mounted, so leaving Bills closes its form
    setStep((s) => Math.max(1, s - 1))
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4 py-8">
      <p className="font-display text-xl font-bold text-primary">Coinflow</p>
      <div
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !ENTER_CONTINUES.has(step)) return
          if (!(e.target instanceof HTMLInputElement) || e.target.type === 'file') return
          e.preventDefault()
          void advance()
        }}
      >
        <Stepper
          step={leaving ? LAST_STEP + 1 : step}
          busy={saving}
          onNext={() => (step === LAST_STEP ? void finish() : void advance())}
          onBack={back}
          backButtonText="Back"
          nextButtonText="Continue"
          completeButtonText="Go to Coinflow"
          completedContent={<p role="status" className="py-10 text-center text-muted-foreground">Taking you home…</p>}
        >
          <Step title="Welcome">
            <WelcomeStep name={values.name} setName={set('name')} error={errorOn('name')} />
          </Step>
          <Step title="Income">
            <IncomeStep
              income={values.income} setIncome={set('income')} incomeError={errorOn('monthlyIncome')}
              payday={values.payday} setPayday={set('payday')} paydayError={errorOn('paydayDay')}
            />
          </Step>
          <Step title="Balance">
            <BalanceStep balance={values.balance} setBalance={set('balance')} error={errorOn('amount')} />
          </Step>
          <Step title="Bills">
            <BillsStep
              error={errorOn('bills')}
              onOpenChange={(o) => {
                setBillsOpen(o)
                if (!o) setIssue(null)
              }}
            />
          </Step>
          <Step title="Fixed costs">
            <FixedCostsStep value={values.fixed} setValue={set('fixed')} error={errorOn('fixedCostsEstimate')} />
          </Step>
          <Step title="UPI">
            <UpiStep upiId={values.upiId} setUpiId={set('upiId')} error={errorOn('upiId')} />
          </Step>
          <Step title="Done">
            <DoneStep name={saved.name} celebrate={!celebrated} />
          </Step>
        </Stepper>
      </div>
      {formError && (
        <p role="alert" className="text-center text-sm text-neutral-negative">
          {formError}
        </p>
      )}
      {/* On Done there is nothing left to skip: "Go to Coinflow" is the way out. */}
      {!leaving && step !== LAST_STEP && (
        <button
          type="button"
          aria-disabled={saving || undefined}
          className="mx-auto min-h-12 rounded-chip px-4 text-sm text-muted-foreground underline underline-offset-4 transition hover:text-foreground active:scale-[0.97]"
          onClick={() => void skip()}
        >
          Skip setup for now
        </button>
      )}
    </main>
  )
}
