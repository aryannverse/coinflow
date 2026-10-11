// Source: Magic UI interactive-hover-button (adapted: asChild)
import { ArrowRight } from "lucide-react"
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

type InteractiveHoverButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Render onto the single child element (e.g. a `next/link`) instead of a `<button>`; never nest a button in a link. */
  asChild?: boolean
}

export function InteractiveHoverButton({
  children,
  className,
  asChild = false,
  ...props
}: InteractiveHoverButtonProps) {
  const classes = cn(
    "group bg-background relative w-auto cursor-pointer overflow-hidden rounded-full border p-2 px-6 text-center font-semibold",
    className
  )
  const inner = (label: ReactNode) => (
    <>
      <div className="flex items-center justify-center gap-2">
        <div className="bg-primary h-2 w-2 rounded-full transition-all duration-300 group-hover:scale-[100.8] group-focus-visible:scale-[100.8]"></div>
        <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0 group-focus-visible:translate-x-12 group-focus-visible:opacity-0">
          {label}
        </span>
      </div>
      <div
        aria-hidden
        className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover:-translate-x-5 group-hover:opacity-100 group-focus-visible:-translate-x-5 group-focus-visible:opacity-100"
      >
        <span>{label}</span>
        <ArrowRight />
      </div>
    </>
  )

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ children?: ReactNode }>
    return (
      <Slot.Root className={classes} {...props}>
        {cloneElement(child, undefined, inner(child.props.children))}
      </Slot.Root>
    )
  }
  return (
    <button className={classes} {...props}>
      {inner(children)}
    </button>
  )
}
