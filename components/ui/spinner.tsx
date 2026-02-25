import type { ComponentProps } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: ComponentProps<typeof SpinnerIcon>) {
  return (
    <SpinnerIcon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
