// Source: React Bits ElasticSlider-TS-TW (reactbits.dev registry)
// (adapted: controlled value/onValueChange, role=slider + aria-value* + keyboard via sliderKeyStep,
//  theme tokens instead of fixed greys, min-h-12 touch target, `elastic` flag to drop the overflow/scale
//  physics under reduced motion, removed the floating numeric label and the defaultValue state)
'use client'

import React, { useRef, useState } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { sliderKeyStep } from '@/lib/slider-keys'

const MAX_OVERFLOW = 50

export interface ElasticSliderProps {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max: number
  step?: number
  label: string
  valueText: (value: number) => string
  /** Elastic overflow + hover scale. Pass false for reduced motion (the slider stays fully usable). */
  elastic?: boolean
  className?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const ElasticSlider: React.FC<ElasticSliderProps> = ({
  value,
  onValueChange,
  min = 0,
  max,
  step = 1,
  label,
  valueText,
  elastic = true,
  className = '',
  leftIcon = <>-</>,
  rightIcon = <>+</>
}) => {
  const sliderRef = useRef<HTMLDivElement>(null)
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle')
  const clientX = useMotionValue(0)
  const overflow = useMotionValue(0)
  const scale = useMotionValue(1)

  useMotionValueEvent(clientX, 'change', (latest: number) => {
    if (!elastic || !sliderRef.current) return
    const { left, right } = sliderRef.current.getBoundingClientRect()
    let distance = 0
    if (latest < left) {
      setRegion('left')
      distance = left - latest
    } else if (latest > right) {
      setRegion('right')
      distance = latest - right
    } else {
      setRegion('middle')
    }
    overflow.jump(decay(distance, MAX_OVERFLOW))
  })

  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return
    const { left, width } = sliderRef.current.getBoundingClientRect()
    if (width === 0) return
    const raw = min + ((e.clientX - left) / width) * (max - min)
    onValueChange(Math.min(max, Math.max(min, Math.round(raw / step) * step)))
    if (elastic) clientX.jump(e.clientX)
  }

  const release = () => {
    if (elastic) animate(overflow, 0, { type: 'spring', bounce: 0.5 })
  }

  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100

  const scaleX = useTransform(() => {
    if (!sliderRef.current) return 1
    const { width } = sliderRef.current.getBoundingClientRect()
    return width === 0 ? 1 : 1 + overflow.get() / width
  })
  const scaleY = useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8])
  const transformOrigin = useTransform(() => {
    if (!sliderRef.current) return 'center'
    const { left, width } = sliderRef.current.getBoundingClientRect()
    return clientX.get() < left + width / 2 ? 'right' : 'left'
  })
  const trackHeight = useTransform(scale, [1, 1.2], [6, 12])
  const trackMargin = useTransform(scale, [1, 1.2], [0, -3])
  const opacity = useTransform(scale, [1, 1.2], [0.7, 1])
  const leftX = useTransform(() => (region === 'left' ? -overflow.get() / scale.get() : 0))
  const rightX = useTransform(() => (region === 'right' ? overflow.get() / scale.get() : 0))

  const grow = () => {
    if (elastic) animate(scale, 1.2)
  }
  const shrink = () => {
    if (elastic) animate(scale, 1)
  }

  return (
    <div className={`flex w-full items-center ${className}`}>
      <motion.div
        onHoverStart={grow}
        onHoverEnd={shrink}
        onTouchStart={grow}
        onTouchEnd={shrink}
        style={elastic ? { scale, opacity } : undefined}
        className="flex w-full touch-none select-none items-center justify-center gap-4"
      >
        <motion.div
          aria-hidden
          animate={{ scale: elastic && region === 'left' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: leftX }}
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valueText(value)}
          className="relative flex min-h-12 w-full flex-grow cursor-grab touch-none select-none items-center rounded-full py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={(e) => {
            fromPointer(e)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) fromPointer(e)
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onKeyDown={(e) => {
            const next = sliderKeyStep(e.key, value, { min, max, step, page: step * 4 })
            if (next === null) return
            e.preventDefault()
            onValueChange(next)
          }}
        >
          <motion.div
            style={
              elastic
                ? { scaleX, scaleY, transformOrigin, height: trackHeight, marginTop: trackMargin, marginBottom: trackMargin }
                : { height: 8 }
            }
            className="flex flex-grow"
          >
            <div className="relative h-full flex-grow overflow-hidden rounded-full bg-surface-2">
              <div className="absolute h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </motion.div>
        </div>

        <motion.div
          aria-hidden
          animate={{ scale: elastic && region === 'right' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: rightX }}
        >
          {rightIcon}
        </motion.div>
      </motion.div>
    </div>
  )
}

function decay(value: number, max: number): number {
  if (max === 0) return 0
  const entry = value / max
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5)
  return sigmoid * max
}

export default ElasticSlider
