import { Minus, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { color, radius, size, space, type } from "@/theme";
import { Num } from "./Text";

/** `surface` input with a `border-strong` edge, `radius-md`, 44px. */
export function TextField(props: TextInputProps) {
  return <TextInput placeholderTextColor={color.muted} {...props} style={[styles.field, props.style]} />;
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** Spoken with the number, e.g. "people". */
  unit: string;
}

/** Round minus and plus either side of a `num-lg` figure. */
export function Stepper({ value, min, max, onChange, unit }: StepperProps) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityValue={{ min, max, now: value, text: `${value} ${unit}` }}>
      <Round label="Fewer" disabled={value <= min} onPress={() => step(-1)} icon="minus" />
      <Num variant="num-lg" style={styles.value}>
        {value}
      </Num>
      <Round label="More" disabled={value >= max} onPress={() => step(1)} icon="plus" />
    </View>
  );
}

function Round({ label, disabled, onPress, icon }: { label: string; disabled: boolean; onPress: () => void; icon: "minus" | "plus" }) {
  const Icon = icon === "minus" ? Minus : Plus;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && { backgroundColor: color["surface-soft"] }]}
    >
      <Icon size={size.iconLg} strokeWidth={size.iconStroke} color={disabled ? color.muted : color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    ...type.body,
    color: color.ink,
    minHeight: size.touch,
    paddingHorizontal: space["space-3"],
    backgroundColor: color.surface,
    borderWidth: size.border,
    borderColor: color["border-strong"],
    borderRadius: radius["radius-md"],
  },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space["space-6"] },
  value: { minWidth: size.touch, textAlign: "center" },
  round: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius["radius-pill"],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: size.border,
    borderColor: color["border-strong"],
  },
});
