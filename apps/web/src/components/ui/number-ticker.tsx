// Source: Magic UI number-ticker (adapted: en-IN grouping; 0.8 s tween; first paint shows the formatted start value)
"use client"

import { useEffect, useMemo, useRef, type ComponentPropsWithoutRef } from "react"
import { animate, useInView, useMotionValue } from "motion/react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
}

/** Ease-out (expo-like): fast start, gentle settle. The tween always lands on `value` in 0.8 s. */
const EASE = [0.22, 1, 0.36, 1] as const

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const initial = direction === "down" ? value : startValue
  const motionValue = useMotionValue(initial)
  const isInView = useInView(ref, { once: true, margin: "0px" })
  const format = useMemo(() => {
    const nf = Intl.NumberFormat("en-IN", { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })
    return (n: number) => nf.format(Number(n.toFixed(decimalPlaces)))
  }, [decimalPlaces])

  useEffect(() => {
    if (!isInView) return
    let controls: ReturnType<typeof animate> | null = null
    const timer = setTimeout(() => {
      controls = animate(motionValue, direction === "down" ? startValue : value, { duration: 0.8, ease: EASE })
    }, delay * 1000)
    return () => {
      clearTimeout(timer)
      controls?.stop()
    }
  }, [motionValue, isInView, delay, value, direction, startValue])

  useEffect(
    () =>
      motionValue.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(latest)
      }),
    [motionValue, format]
  )

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tracking-wider text-black tabular-nums dark:text-white",
        className
      )}
      {...props}
    >
      {format(initial)}
    </span>
  )
}
