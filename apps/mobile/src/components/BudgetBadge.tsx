import type { Pricing } from "@pantry/contract";
import { CircleAlert, CircleCheck, CirclePlus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { badgeFor } from "@/deck/badge";
import { color, radius, size, space } from "@/theme";
import { Num, T } from "./Text";

const LOOK = {
  fits: { fg: "fits", bg: "fits-soft", Icon: CircleCheck },
  complete: { fg: "complete", bg: "complete-soft", Icon: CirclePlus },
  over: { fg: "over", bg: "over-soft", Icon: CircleAlert },
} as const;

/**
 * DESIGN.md › BudgetBadge: pill, 28px, icon + word + `num-sm` figure. The
 * three status colours are close in lightness, so it always carries a word
 * and an icon, never colour alone.
 */
export function BudgetBadge({ pricing }: { pricing: Pricing }) {
  const b = badgeFor(pricing);
  const look = LOOK[b.status];
  return (
    <View accessible accessibilityLabel={b.label} style={[styles.badge, { backgroundColor: color[look.bg] }]}>
      <look.Icon size={size.icon} strokeWidth={size.iconStroke} color={color[look.fg]} />
      {b.parts.map((p, i) =>
        p.kind === "word" ? (
          <T key={i} variant="caption" tone={look.fg}>
            {p.text}
          </T>
        ) : (
          <Num key={i} variant="num-sm" tone={look.fg}>
            {p.text}
          </Num>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    minHeight: size.badge,
    flexDirection: "row",
    alignItems: "center",
    gap: space["space-1"],
    paddingHorizontal: space["space-2"],
    borderRadius: radius["radius-pill"],
  },
});
