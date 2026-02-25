"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type AccordionType = "single" | "multiple"

type AccordionContextValue = {
  type: AccordionType
  openValues: string[]
  toggleItem: (value: string) => void
  collapsible: boolean
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)

type AccordionItemContextValue = {
  value: string
  isOpen: boolean
  triggerId: string
  contentId: string
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null)

type AccordionProps = {
  type: AccordionType
  collapsible?: boolean
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (value: string | string[]) => void
  className?: string
  children: React.ReactNode
}

function normalizeValue(type: AccordionType, value?: string | string[]) {
  if (type === "multiple") {
    if (Array.isArray(value)) return value
    if (typeof value === "string" && value) return [value]
    return []
  }

  if (typeof value === "string" && value) return [value]
  if (Array.isArray(value) && value[0]) return [value[0]]
  return []
}

function Accordion({
  type,
  collapsible = false,
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: AccordionProps) {
  const isControlled = value !== undefined
  const [internal, setInternal] = React.useState<string[]>(() =>
    normalizeValue(type, defaultValue),
  )
  const openValues = isControlled ? normalizeValue(type, value) : internal

  const update = React.useCallback(
    (next: string[]) => {
      if (!isControlled) {
        setInternal(next)
      }

      if (!onValueChange) return
      if (type === "multiple") {
        onValueChange(next)
      } else {
        onValueChange(next[0] ?? "")
      }
    },
    [isControlled, onValueChange, type],
  )

  const toggleItem = React.useCallback(
    (itemValue: string) => {
      if (type === "multiple") {
        const next = openValues.includes(itemValue)
          ? openValues.filter((value) => value !== itemValue)
          : [...openValues, itemValue]
        update(next)
        return
      }

      const isOpen = openValues[0] === itemValue
      if (isOpen) {
        if (!collapsible) return
        update([])
        return
      }
      update([itemValue])
    },
    [collapsible, openValues, type, update],
  )

  return (
    <AccordionContext.Provider
      value={{ type, openValues, toggleItem, collapsible }}
    >
      <div data-slot="accordion" className={cn("w-full", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

function AccordionItem({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const accordion = React.useContext(AccordionContext)
  if (!accordion) {
    throw new Error("AccordionItem must be used within Accordion")
  }

  const isOpen = accordion.openValues.includes(value)
  const id = React.useId()
  const triggerId = `accordion-trigger-${id}`
  const contentId = `accordion-content-${id}`

  return (
    <AccordionItemContext.Provider
      value={{ value, isOpen, triggerId, contentId }}
    >
      <div
        data-slot="accordion-item"
        data-state={isOpen ? "open" : "closed"}
        className={cn(className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
}

function AccordionTrigger({
  className,
  onClick,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const accordion = React.useContext(AccordionContext)
  const item = React.useContext(AccordionItemContext)
  if (!accordion || !item) {
    throw new Error("AccordionTrigger must be used within AccordionItem")
  }

  return (
    <div className="flex">
      <button
        type="button"
        id={item.triggerId}
        data-slot="accordion-trigger"
        data-state={item.isOpen ? "open" : "closed"}
        aria-expanded={item.isOpen}
        aria-controls={item.contentId}
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg py-4 text-left text-sm font-medium outline-none transition-all focus-visible:ring-3 [&[data-state=open]>:last-child_svg]:rotate-180",
          className,
        )}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            accordion.toggleItem(item.value)
          }
        }}
        {...props}
      >
        {children}
      </button>
    </div>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const item = React.useContext(AccordionItemContext)
  if (!item) {
    throw new Error("AccordionContent must be used within AccordionItem")
  }

  const [hasOpened, setHasOpened] = React.useState(false)

  React.useEffect(() => {
    if (item.isOpen && !hasOpened) {
      setHasOpened(true)
    }
  }, [item.isOpen, hasOpened])

  return (
    <div
      id={item.contentId}
      role="region"
      aria-labelledby={item.triggerId}
      data-slot="accordion-content"
      data-state={item.isOpen ? "open" : "closed"}
      className={cn(
        "grid overflow-hidden text-sm transition-all data-[state=closed]:grid-rows-[0fr] data-[state=open]:grid-rows-[1fr]",
        className,
      )}
      {...props}
    >
      <div className="min-h-0">{(item.isOpen || hasOpened) && children}</div>
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
