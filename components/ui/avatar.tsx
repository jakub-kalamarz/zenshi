"use client"

import * as React from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
)
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ComponentPropsWithoutRef<typeof Image>
>(({ className, alt = "", sizes, ...props }, ref) => {
  const hasSizing =
    props.fill ||
    (typeof props.width !== "undefined" && typeof props.height !== "undefined")

  if (hasSizing) {
    return (
      <Image
        ref={ref}
        alt={alt}
        className={cn("aspect-square h-full w-full object-cover", className)}
        sizes={sizes}
        {...props}
      />
    )
  }

  return (
    <Image
      ref={ref}
      fill
      alt={alt}
      sizes={sizes ?? "40px"}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  )
})
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
