import type { Method } from "@pantry/contract";
import { Blender, Coffee, Fan, Flame, Microwave, Refrigerator, Snowflake, Soup } from "lucide-react-native";
import { Oven } from "@/components/icons/Oven";
import type { Icon } from "@/components/icons/types";

/** Outline icons stand in for the kitchen illustration until it's drawn (CLAUDE.md to-do). */
export const APPLIANCE_ICONS: Record<Method, Icon> = {
  stove: Flame,
  oven: Oven,
  microwave: Microwave,
  fridge: Refrigerator,
  freezer: Snowflake,
  kettle: Coffee,
  blender: Blender,
  air_fryer: Fan,
  rice_cooker: Soup,
};
