import type { Method } from "@pantry/contract";
import { Check } from "lucide-react-native";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { KITCHEN_SPOTS } from "@/onboarding/kitchen";
import { APPLIANCES } from "@/onboarding/options";
import { color, radius, size, space } from "@/theme";

const pct = (f: number) => `${Math.round(f * 1000) / 10}%` as `${number}%`;

/**
 * The kitchen illustration (DESIGN.md › Imagery): tap an appliance to
 * highlight it. Each one is a checkbox with its name in the app's own type,
 * under it (above the cooktop), so the name scales, reads aloud and
 * translates.
 */
export function KitchenPicker({ selected, onToggle }: { selected: readonly Method[]; onToggle: (m: Method) => void }) {
  return (
    <View style={styles.frame}>
      <Image source={require("../../assets/kitchen.webp")} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors accessible={false} />
      {APPLIANCES.map(({ method, label }) => {
        const s = KITCHEN_SPOTS[method];
        const on = selected.includes(method);
        return (
          <Pressable
            key={method}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={label}
            hitSlop={space["space-2"]}
            onPress={() => onToggle(method)}
            style={({ pressed }) => [styles.hit, { left: pct(s.x), top: pct(s.y), width: pct(s.w), height: pct(s.h) }, on && styles.on, pressed && !on && styles.pressed]}
          >
            {on ? (
              <View style={styles.badge}>
                <Check size={size.icon} strokeWidth={size.iconStroke * 2} color={color["on-primary"]} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {APPLIANCES.map(({ method, label }) => {
        const s = KITCHEN_SPOTS[method];
        // The name's box: wider than the appliance, centred on it, under it (above the cooktop).
        const pad = s.wide ? 0.12 : 0.07;
        const place = s.label === "above" ? { bottom: pct(1 - s.y + 0.025) } : { top: pct(s.y + s.h) };
        return (
          <T
            key={`${method}-label`}
            variant="caption"
            tone={selected.includes(method) ? "primary" : "ink"}
            numberOfLines={1}
            importantForAccessibility="no"
            aria-hidden
            pointerEvents="none"
            style={[styles.label, { left: pct(Math.max(0, s.x - pad)), width: pct(s.w + 2 * pad) }, place]}
          >
            {label}
          </T>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 1, borderRadius: radius["radius-lg"], overflow: "hidden" },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  hit: { position: "absolute", borderRadius: radius["radius-md"], borderWidth: size.focus, borderColor: "transparent" },
  on: { borderColor: color.primary },
  pressed: { borderColor: color["border-strong"] },
  badge: {
    position: "absolute",
    top: -space["space-2"],
    right: -space["space-2"],
    width: size.iconLg,
    height: size.iconLg,
    borderRadius: radius["radius-pill"],
    backgroundColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { position: "absolute", textAlign: "center" },
});
