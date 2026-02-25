"use client";

import type { ReactNode } from "react";
import { IconContext } from "@phosphor-icons/react";

type IconProviderProps = {
  children: ReactNode;
};

export function IconProvider({ children }: IconProviderProps) {
  return (
    <IconContext.Provider value={{ weight: "duotone" }}>
      {children}
    </IconContext.Provider>
  );
}
