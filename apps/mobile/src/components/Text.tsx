import { Text as RNText, type TextProps } from "react-native";
import { color, type, type ColorName, type TypeName } from "@/theme";

type WordStyle = Exclude<TypeName, "num-lg" | "num" | "num-sm">;
type NumStyle = Extract<TypeName, "num-lg" | "num" | "num-sm">;

interface Props extends TextProps {
  tone?: ColorName;
}

/** Words, in Inter. Sentence case, always (DESIGN.md). */
export function T({ variant = "body", tone = "ink", style, ...rest }: Props & { variant?: WordStyle }) {
  return <RNText {...rest} style={[type[variant], { color: color[tone] }, style]} />;
}

/** Every number (prices, calories, protein, counts), in IBM Plex Sans. */
export function Num({ variant = "num", tone = "ink", style, ...rest }: Props & { variant?: NumStyle }) {
  return <RNText {...rest} style={[type[variant], { color: color[tone], fontVariant: ["tabular-nums"] }, style]} />;
}
