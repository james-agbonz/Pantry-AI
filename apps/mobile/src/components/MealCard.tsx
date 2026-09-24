import type { PricedCard } from "@pantry/contract";
import { Clock, Utensils } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { kcal, minutes, protein } from "@/format";
import { color, radius, size, space } from "@/theme";
import { BudgetBadge } from "./BudgetBadge";
import { Num, T } from "./Text";

/** `undefined` while loading, `null` if it failed, else the photo URL. */
export type Photo = string | null | undefined;

/**
 * DESIGN.md › MealCard: photo first, name in `title`, meta row (time, ~kcal,
 * ~protein) in `num-sm`, one budget badge. The photo is 4:3; with `fill`
 * (the deck) the card takes the height it's given and the photo grows into it.
 */
export function MealCard({ item, photo, fill = false }: { item: PricedCard; photo: Photo; fill?: boolean }) {
  const { card, pricing } = item;
  return (
    <View style={[styles.card, fill && styles.fill]}>
      <View style={[styles.photo, fill && styles.photoFill]}>
        {photo ? (
          <Animated.Image entering={FadeIn.duration(300)} source={{ uri: photo }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
        ) : photo === null ? (
          // Plain fallback: a failed image never blocks the card (SPEC §11).
          <Utensils size={size.iconLg} strokeWidth={size.iconStroke} color={color.muted} accessibilityLabel="No photo" />
        ) : null}
      </View>
      <View style={styles.body}>
        <T variant="title" numberOfLines={2}>
          {card.name}
        </T>
        <View style={styles.meta}>
          <Clock size={size.icon} strokeWidth={size.iconStroke} color={color.muted} />
          <Num variant="num-sm" tone="muted">
            {minutes(card.time_min)}
          </Num>
          <Num variant="num-sm" tone="muted">
            ·
          </Num>
          <Num variant="num-sm" tone="muted">
            {kcal(card.kcal)}
          </Num>
          <Num variant="num-sm" tone="muted">
            ·
          </Num>
          <Num variant="num-sm" tone="muted">
            {protein(card.protein_g)}
          </Num>
        </View>
        <BudgetBadge pricing={pricing} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius["radius-lg"], overflow: "hidden" },
  fill: { flex: 1 },
  photoFill: { flex: 1, aspectRatio: undefined, minHeight: 0 },
  photo: { aspectRatio: 4 / 3, backgroundColor: color["surface-soft"], alignItems: "center", justifyContent: "center" },
  body: { padding: space["space-4"], gap: space["space-2"] },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space["space-1"] },
});
