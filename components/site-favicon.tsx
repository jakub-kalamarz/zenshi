"use client";

import Image from "next/image";
import { useState } from "react";
import { GlobeIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type SiteFaviconProps = {
  siteUrl: string;
  size?: number;
  className?: string;
};

export function SiteFavicon({
  siteUrl,
  size = 36,
  className,
}: SiteFaviconProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pixelSize = Math.max(16, Math.min(size, 96));
  const fetchSize = 256;
  const containerClasses = cn(
    "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-[1px]",
    className
  );

  if (failed) {
    return (
      <span
        className={containerClasses}
        style={{ width: pixelSize, height: pixelSize }}
        aria-hidden="true"
      >
        <GlobeIcon
          size={Math.floor(pixelSize * 0.52)}
          weight="regular"
          className="text-muted-foreground"
        />
      </span>
    );
  }

  return (
    <span
      className={containerClasses}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <div className="relative h-full w-full">
        <Image
          src={`/api/favicon?siteUrl=${encodeURIComponent(siteUrl)}&size=${fetchSize}`}
          alt=""
          className={cn(
            "object-contain transition-opacity duration-150",
            loaded ? "opacity-100" : "opacity-0"
          )}
          fill
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          unoptimized
        />
      </div>
    </span>
  );
}
