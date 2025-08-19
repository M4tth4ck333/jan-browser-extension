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
        // Larger, higher-contrast track
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-input shadow-xs transition-all outline-none",
        // Colors
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        // Focus ring
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Bigger thumb with clear movement and slight shadow
          "pointer-events-none block h-5 w-5 rounded-full shadow-sm ring-0 transition-transform",
          // Thumb colors
          "data-[state=unchecked]:bg-background data-[state=checked]:bg-primary-foreground",
          // Translate distances aligned to track size
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
