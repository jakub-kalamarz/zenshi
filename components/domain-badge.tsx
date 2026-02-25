"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { SiteFavicon } from "@/components/site-favicon";
import { ArrowRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function displaySiteName(raw: string) {
  try {
    const url = new URL(raw);
    return url.hostname;
  } catch {
    return raw;
  }
}

function buildSiteHref(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("sc-domain:")) {
    const domain = trimmed.slice("sc-domain:".length).trim();
    return domain ? `https://${domain}` : null;
  }
  if (/^[a-z0-9.-]+$/i.test(trimmed) && trimmed.includes(".")) {
    return `https://${trimmed}`;
  }
  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch {
    return null;
  }
}

type DomainBadgeProps = {
  siteUrl: string;
  siteId?: string;
  size?: number;
  className?: string;
};

export function DomainBadge({
  siteUrl,
  siteId,
  size = 36,
  className,
}: DomainBadgeProps) {
  const href = buildSiteHref(siteUrl);
  const name = displaySiteName(siteUrl);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const update = () => {
      const next = el.scrollWidth > el.clientWidth + 1;
      setIsTruncated(next);
    };
    update();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => update());
      observer.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [name]);

  const nameNode = (
    <span
      ref={textRef}
      className="truncate text-[0.93rem] font-medium leading-tight tracking-[-0.01em] text-foreground"
    >
      {name}
    </span>
  );
  const nameWithTooltip = isTruncated ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{nameNode}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="text-xs font-medium tracking-[0.01em]"
        >
          {name}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    nameNode
  );
  const content = (
    <>
      <SiteFavicon siteUrl={siteUrl} size={size} />
      <div className="min-w-0 leading-none">{nameWithTooltip}</div>
      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </>
  );

  const linkClasses = cn(
    "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.82rem] leading-none transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  if (siteId) {
    return (
      <Link href={`/site/${siteId}`} className={linkClasses}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={linkClasses} rel="noreferrer">
        {content}
      </a>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>{content}</div>
  );
}
