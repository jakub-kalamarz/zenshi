"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

type ChartTooltipContextType = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

const ChartTooltipContext = createContext<ChartTooltipContextType | undefined>(
  undefined,
);

export function ChartTooltipProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleSetActiveId = useCallback((id: string | null) => {
    setActiveId(id);
  }, []);

  return (
    <ChartTooltipContext.Provider
      value={{ activeId, setActiveId: handleSetActiveId }}
    >
      {children}
    </ChartTooltipContext.Provider>
  );
}

export function useChartTooltip() {
  const context = useContext(ChartTooltipContext);
  if (context === undefined) {
    throw new Error("useChartTooltip must be used within a ChartTooltipProvider");
  }
  return context;
}
