import * as React from "react"

import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "border-border bg-muted text-muted-foreground rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
