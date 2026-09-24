import { router } from "expo-router";
import { Check, RotateCcw, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { MealCard, type Photo } from "@/components/MealCard";
import { SwipeCard, type SwipeCardHandle } from "@/components/SwipeCard";
import { Num, T } from "@/components/Text";
import { allPassed, canRewind, counterText, decksLeftText, topCard } from "@/deck/state";
import { useSession } from "@/state/session";
import { color, radius, size, space } from "@/theme";

/**
 * The deck (SPEC §10). Swipe right selects the meal and ends the deck; swipe
 * left passes, for this session. Rewind is always visible, unlimited, free.
 * The round buttons mirror the swipes.
 */
export default function Deck() {
  const s = useSession();
  const deck = s.deck;
  const card = useRef<SwipeCardHandle>(null);
  const [photos, setPhotos] = useState<Record<string, Photo>>({});

  // All photos fire at once; the top card is asked for first (SPEC §11).
  useEffect(() => {
    if (!deck) return;
    let live = true;
    setPhotos({});
    deck.cards.forEach((c, i) => {
      s.images
        .load(c.card.image_prompt, i)
        .then((url) => live && setPhotos((p) => ({ ...p, [c.card.id]: url })))
        .catch(() => live && setPhotos((p) => ({ ...p, [c.card.id]: null })));
    });
    return () => {
      live = false;
    };
  }, [deck?.cards, s.images]);

  if (!deck) return null;

  const top = topCard(deck);
  const next = deck.cards[deck.index + 1];
  const left = s.decksLeft ?? 0;

  const pass = () => s.dispatch({ type: "deck", action: { type: "pass" } });
  const select = () => {
    if (!top) return;
    s.dispatch({ type: "select", card: top });
    router.replace("/meal");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => router.replace("/home")} style={styles.iconBtn}>
          <X size={size.iconLg} strokeWidth={size.iconStroke} color={color.ink} />
        </Pressable>
        <Num variant="num-sm" tone="muted">
          {counterText(deck, left)}
        </Num>
        <View style={styles.iconBtn} />
      </View>

      {allPassed(deck) ? (
        <View style={styles.done}>
          <T variant="display">That's all six</T>
          <T variant="body" tone="muted">
            {left > 0 ? "A new deck leaves out the ones you passed." : "That's today's decks. More tomorrow, or rewind to look again."}
          </T>
        </View>
      ) : (
        <View style={styles.stack}>
          {next ? (
            // The next card's edge shows below the top one, so it reads as a deck.
            <View style={styles.under} pointerEvents="none">
              <MealCard item={next} photo={photos[next.card.id]} fill />
            </View>
          ) : null}
          <View style={styles.top}>
            {top ? <SwipeCard key={top.card.id} ref={card} item={top} photo={photos[top.card.id]} onPass={pass} onSelect={select} /> : null}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        {allPassed(deck) ? (
          <View style={styles.doneActions}>
            <Button kind="secondary" label="Rewind" onPress={() => s.dispatch({ type: "deck", action: { type: "rewind" } })} />
            {left > 0 ? <Button label="Deal a new deck" onPress={() => router.replace("/loading")} /> : null}
            <T variant="body-sm" tone="muted" style={styles.centerText}>
              {decksLeftText(left)}
            </T>
          </View>
        ) : (
          <View style={styles.buttons}>
            <Round label="Pass" onPress={() => card.current?.fling("left")}>
              <X size={size.iconLg} strokeWidth={size.iconStroke} color={color.ink} />
            </Round>
            <Round label="Rewind" small disabled={!canRewind(deck)} onPress={() => s.dispatch({ type: "deck", action: { type: "rewind" } })}>
              <RotateCcw size={size.icon} strokeWidth={size.iconStroke} color={canRewind(deck) ? color.ink : color.muted} />
            </Round>
            <Round label="Pick this meal" keep onPress={() => card.current?.fling("right")}>
              <Check size={size.iconLg} strokeWidth={size.iconStroke} color={color["on-primary"]} />
            </Round>
          </View>
        )}
        <T variant="body-sm" tone="muted" style={styles.centerText}>
          Prices are typical, not quotes.
        </T>
      </View>
    </SafeAreaView>
  );
}

function Round(props: { label: string; onPress: () => void; keep?: boolean; small?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const d = props.small ? size.touch : size.swipe;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.round,
        { width: d, height: d },
        props.keep
          ? { backgroundColor: pressed ? color["primary-active"] : color.primary, borderColor: color.primary }
          : props.disabled
            ? // Nothing to act on: no edge, a quiet fill, a muted icon.
              { backgroundColor: color["surface-soft"], borderColor: color["surface-soft"] }
            : { backgroundColor: pressed ? color["surface-soft"] : color.surface },
      ]}
    >
      {props.children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  bar: { minHeight: size.touch, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space["space-2"] },
  iconBtn: { width: size.touch, height: size.touch, alignItems: "center", justifyContent: "center" },
  stack: { flex: 1, marginHorizontal: space["space-4"], marginTop: space["space-2"], marginBottom: space["space-4"] },
  top: { flex: 1, marginBottom: space["space-3"] },
  under: { position: "absolute", left: space["space-3"], right: space["space-3"], top: space["space-3"], bottom: 0 },
  done: { flex: 1, paddingHorizontal: space["space-4"], paddingTop: space["space-8"], gap: space["space-2"] },
  footer: { paddingHorizontal: space["space-4"], paddingBottom: space["space-4"], gap: space["space-3"] },
  buttons: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space["space-6"] },
  doneActions: { gap: space["space-3"] },
  centerText: { textAlign: "center" },
  round: {
    borderRadius: radius["radius-pill"],
    borderWidth: size.border,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
});
