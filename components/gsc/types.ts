import type { ComponentType } from "react";
import {
  SortAscending,
  CursorClick,
  TrendUp,
  Percent,
} from "@phosphor-icons/react";

export type DateRange = { start: string; end: string };

export type Folder = {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at?: string;
  updated_at?: string;
};

export type CompareMode = "disabled" | "previous" | "yoy" | "custom";
export type Granularity = "day" | "week" | "month";
export type SortId = "az" | "total-clicks" | "growth-clicks" | "growth-clicks-pct";

export type SortOption = {
  id: SortId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const RANGE_PRESETS = [
  { id: "7d", label: "7D", days: 7 },
  { id: "28d", label: "28D", days: 28 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"] | "custom";

export const SORT_OPTIONS: SortOption[] = [
  { id: "az", label: "A to Z", icon: SortAscending },
  { id: "total-clicks", label: "Total Clicks", icon: CursorClick },
  { id: "growth-clicks", label: "Growth (Clicks)", icon: TrendUp },
  { id: "growth-clicks-pct", label: "Growth % (Clicks)", icon: Percent },
];

export const FOLDER_ICON_OPTIONS = [
  { id: "folder", label: "Folder" },
  { id: "globe", label: "Globe" },
  { id: "chart", label: "Chart" },
  { id: "rocket", label: "Rocket" },
  { id: "briefcase", label: "Briefcase" },
  { id: "store", label: "Store" },
  { id: "code", label: "Code" },
  { id: "megaphone", label: "Megaphone" },
  { id: "money", label: "Money" },
  { id: "users", label: "Users" },
  { id: "shield", label: "Shield" },
  { id: "wrench", label: "Wrench" },
  { id: "lightning", label: "Lightning" },
  { id: "database", label: "Database" },
  { id: "house", label: "House" },
  { id: "target", label: "Target" },
  { id: "cart", label: "Cart" },
  { id: "puzzle", label: "Puzzle" },
  { id: "cloud", label: "Cloud" },
  { id: "star", label: "Star" },
  { id: "settings", label: "Settings" },
  { id: "palette", label: "Palette" },
  { id: "news", label: "News" },
  { id: "health", label: "Health" },
] as const;

export const FOLDER_COLOR_OPTIONS = [
  { value: "#6b7280", label: "Slate" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Gold" },
  { value: "#22c55e", label: "Green" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
] as const;
