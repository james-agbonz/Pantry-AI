import type { ComponentType } from "react";

/** The props every icon takes, lucide's or our own. */
export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export type Icon = ComponentType<IconProps>;
