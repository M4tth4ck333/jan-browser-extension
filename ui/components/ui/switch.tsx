import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Track: size, shape, baseline colors
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors outline-none",
        "bg-muted border-border",
        // Checked state uses brand primary and hides border
        "data-[state=checked]:bg-primary data-[state=checked]:border-transparent",
        // Focus ring uses brand pastel blue
        "focus-visible:ring-2 focus-visible:ring-[--brand-blue] focus-visible:border-[--brand-blue]",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Thumb
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform",
          // Translate distances aligned to track size
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
