import type { Method } from "@pantry/contract";
import { Blender, Coffee, Croissant, Fan, Flame, Microwave, Refrigerator, Snowflake, Soup, type LucideIcon } from "lucide-react-native";

/** Outline icons stand in for the kitchen illustration until it's drawn (CLAUDE.md to-do). */
export const APPLIANCE_ICONS: Record<Method, LucideIcon> = {
  stove: Flame,
  oven: Croissant,
  microwave: Microwave,
  fridge: Refrigerator,
  freezer: Snowflake,
  kettle: Coffee,
  blender: Blender,
  air_fryer: Fan,
  rice_cooker: Soup,
};
