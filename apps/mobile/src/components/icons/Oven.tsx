import Svg, { Circle, Path, Rect } from "react-native-svg";
import { size as sizes } from "@/theme";
import type { IconProps } from "./types";

/**
 * Lucide has no oven, so this one is drawn on lucide's 24px grid with the
 * same round caps and joins: a rounded box, a control strip with two knobs,
 * and a door window. Stroke width comes from the caller, like every icon.
 */
export function Oven({ size = sizes.iconLg, color = "currentColor", strokeWidth = sizes.iconStroke }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="18" height="18" rx="2" />
      <Path d="M3 8h18" />
      <Circle cx="7" cy="5.5" r="0.75" />
      <Circle cx="11" cy="5.5" r="0.75" />
      <Rect x="7" y="11.5" width="10" height="6" rx="1" />
    </Svg>
  );
}
