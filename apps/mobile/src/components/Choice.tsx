import { Check, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { color, radius, size, space } from "@/theme";
import { T } from "./Text";

interface ChoiceProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

/** Unselected: `surface` + `border-strong`. Selected: `primary-soft` + `primary` edge and label + check. */
function frame(selected: boolean, pressed: boolean) {
  return {
    backgroundColor: selected ? color["primary-soft"] : pressed ? color["surface-soft"] : color.surface,
    borderColor: selected ? color.primary : color["border-strong"],
  };
}

/** DESIGN.md › IngredientChip. 40px tall, `radius-md`. Also used for hard limits. */
export function Chip({ label, selected, onPress, testID }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      testID={testID}
      hitSlop={(size.touch - size.chip) / 2}
      style={({ pressed }) => [styles.chip, frame(selected, pressed)]}
    >
      {selected && <Check size={size.icon} strokeWidth={size.iconStroke} color={color.primary} />}
      <T variant="label" tone={selected ? "primary" : "ink"}>
        {label}
      </T>
    </Pressable>
  );
}

/** A full-width single choice with an optional helper line, for questions with one answer. */
export function OptionRow({ label, hint, selected, onPress, testID }: ChoiceProps & { hint?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, frame(selected, pressed)]}
    >
      <View style={styles.rowText}>
        <T variant="label" tone={selected ? "primary" : "ink"}>
          {label}
        </T>
        {hint ? (
          <T variant="body-sm" tone="muted">
            {hint}
          </T>
        ) : null}
      </View>
      {selected && <Check size={size.icon} strokeWidth={size.iconStroke} color={color.primary} />}
    </Pressable>
  );
}

/** A square tile with an outline icon, for appliances. Stands in for the kitchen illustration. */
export function Tile({ label, icon: Icon, selected, onPress, testID }: ChoiceProps & { icon: LucideIcon }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.tile, frame(selected, pressed)]}
    >
      <Icon size={size.iconLg} strokeWidth={size.iconStroke} color={selected ? color.primary : color.ink} />
      <T variant="caption" tone={selected ? "primary" : "ink"} style={styles.tileLabel}>
        {label}
      </T>
      {selected && (
        <View style={styles.tileCheck}>
          <Check size={size.icon} strokeWidth={size.iconStroke} color={color.primary} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: size.chip,
    flexDirection: "row",
    alignItems: "center",
    gap: space["space-1"],
    paddingHorizontal: space["space-3"],
    borderRadius: radius["radius-md"],
    borderWidth: size.border,
  },
  row: {
    minHeight: size.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: space["space-3"],
    paddingHorizontal: space["space-4"],
    paddingVertical: space["space-3"],
    borderRadius: radius["radius-md"],
    borderWidth: size.border,
  },
  rowText: { flex: 1, gap: space["space-1"] },
  tile: {
    flexBasis: "30%",
    flexGrow: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space["space-2"],
    padding: space["space-2"],
    borderRadius: radius["radius-md"],
    borderWidth: size.border,
  },
  tileLabel: { textAlign: "center" },
  tileCheck: { position: "absolute", top: space["space-2"], right: space["space-2"] },
});
