import { Pressable, StyleSheet } from "react-native";
import { color, radius, size, space } from "@/theme";
import { T } from "./Text";

interface Props {
  label: string;
  onPress: () => void;
  /** primary: the one olive action per screen. secondary: surface with an edge. text: olive label only. */
  kind?: "primary" | "secondary" | "text";
  disabled?: boolean;
  testID?: string;
}

/** DESIGN.md › Button. 44px, `radius-sm`, `label` type. */
export function Button({ label, onPress, kind = "primary", disabled = false, testID }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        kind === "primary" && { backgroundColor: disabled ? color["primary-soft"] : pressed ? color["primary-active"] : color.primary },
        kind === "secondary" && [styles.secondary, pressed && { backgroundColor: color["surface-soft"] }],
        kind === "text" && pressed && { backgroundColor: color["surface-soft"] },
      ]}
    >
      <T
        variant="label"
        tone={kind === "primary" ? (disabled ? "muted" : "on-primary") : disabled ? "muted" : kind === "text" ? "primary" : "ink"}
      >
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.touch,
    borderRadius: radius["radius-sm"],
    paddingHorizontal: space["space-4"],
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: color.surface,
    borderWidth: size.border,
    borderColor: color["border-strong"],
  },
});
