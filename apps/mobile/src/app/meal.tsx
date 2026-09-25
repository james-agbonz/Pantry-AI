import { vocabulary } from "@pantry/vocabulary";
import * as Clipboard from "expo-clipboard";
import { Redirect, router } from "expo-router";
import { ChevronRight, Clock, Utensils } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BudgetBadge } from "@/components/BudgetBadge";
import { Button } from "@/components/Button";
import { OptionRow } from "@/components/Choice";
import { Screen } from "@/components/Screen";
import { Num, T } from "@/components/Text";
import { kcal, minutes, money, priceNote, protein, whole } from "@/format";
import { shoppingList } from "@/meal/shopping";
import { useLog } from "@/state/log";
import { useProfile } from "@/state/profile";
import { useSession } from "@/state/session";
import { color, radius, size, space } from "@/theme";

const LABEL = new Map(vocabulary.groups.map((g) => [g.id, g.label]));

/**
 * The meal screen (SPEC §12): what you have, what to buy and what it costs,
 * what completes it, the method, and a shopping list to copy. Tap a bought
 * item to swap it for another in its group; the totals follow.
 */
export default function Meal() {
  const { selected, selectedPhoto, pricer } = useSession();
  const { profile } = useProfile();
  const { today, loggedIds } = useLog();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [swapGroup, setSwapGroup] = useState<string | null>(null);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  const pricing = useMemo(
    () => (selected ? pricer.price(selected.card, selected.pricing.budget, choices) : null),
    [selected, pricer, choices],
  );
  if (!selected || !pricing) return <Redirect href="/home" />;
  const { card } = selected;

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(shoppingList(card, pricing));
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  };

  const needed = new Map(card.missing.map((m) => [m.group, m.qty]));
  const targets = profile?.targets ?? null;

  return (
    <Screen
      title={card.name}
      titleVariant="title"
      hero={
        <View style={styles.photo}>
          {selectedPhoto ? (
            // The deck already loaded it (SPEC §11): no second request.
            <Image source={{ uri: selectedPhoto }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          ) : (
            <Utensils size={size.iconLg} strokeWidth={size.iconStroke} color={color.muted} accessibilityLabel="No photo" />
          )}
        </View>
      }
      footer={
        <>
          {copied ? (
            <T variant="body-sm" tone="muted" style={styles.center} accessibilityLiveRegion="polite">
              {copied === "yes" ? "Copied. Paste it into your notes or a message." : "Couldn't copy on this device."}
            </T>
          ) : null}
          <Button kind="text" label="Back to home" onPress={() => router.replace("/home")} />
          <Button label="Copy shopping list" onPress={copy} />
        </>
      }
    >
      <View style={styles.block}>
        <View style={styles.meta}>
          <Clock size={size.icon} strokeWidth={size.iconStroke} color={color.muted} />
          <Num variant="num-sm" tone="muted">
            {minutes(card.time_min)} · {kcal(card.kcal)} · {protein(card.protein_g)}
          </Num>
        </View>
        {loggedIds.has(card.id) ? (
          <T variant="body-sm" tone="muted">
            Logged for today.{" "}
            <Num variant="num-sm" tone="muted">
              {targets
                ? `${kcal(today.kcal)} of ~${whole(targets.kcal)} · ${protein(today.protein_g)} of ~${whole(targets.protein)} g`
                : `${kcal(today.kcal)} · ${protein(today.protein_g)} so far`}
            </Num>
          </T>
        ) : null}
      </View>

      <View style={[styles.card, styles.block]}>
        <View style={styles.spread}>
          <View>
            <Num variant="num-lg">{money(pricing.total)}</Num>
            <T variant="caption" tone="muted">
              of ${pricing.budget} budget
            </T>
          </View>
          <BudgetBadge pricing={pricing} withTotal={false} />
        </View>
        <T variant="body-sm" tone="muted">
          {priceNote(pricing.placeholder, pricing.as_of)}
        </T>
      </View>

      <Section title="You have">
        <T variant="body">{card.uses.map((u) => LABEL.get(u) ?? u).join(", ")}</T>
      </Section>

      <Section title="Buy">
        <View style={styles.card}>
          {pricing.buy.map((b, i) => (
            <Pressable
              key={b.group}
              accessibilityRole="button"
              accessibilityLabel={`${b.item}, ${b.unit}, ${money(b.price)}. Swap`}
              onPress={() => setSwapGroup(b.group)}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: color["surface-soft"] }]}
            >
              <View style={styles.grow}>
                <T variant="label">{b.item}</T>
                <T variant="body-sm" tone="muted">
                  {b.unit} · need {needed.get(b.group)}
                  {b.role === "completes" ? " · completes it" : ""}
                </T>
              </View>
              <Num variant="num">{money(b.price)}</Num>
              <ChevronRight size={size.icon} strokeWidth={size.iconStroke} color={color.muted} />
            </Pressable>
          ))}
        </View>
        <T variant="body-sm" tone="muted">
          Tap an item to swap it for another of the same kind.
        </T>
      </Section>

      {pricing.to_complete.length ? (
        <Section title="To complete">
          <View style={styles.card}>
            {pricing.to_complete.map((t, i) => (
              <View key={t.group} style={[styles.row, i > 0 && styles.divider]}>
                <View style={styles.grow}>
                  <T variant="label">{t.item}</T>
                  <T variant="body-sm" tone="muted">
                    {t.unit} · need {needed.get(t.group)}
                  </T>
                </View>
                <Num variant="num">{money(t.price)}</Num>
              </View>
            ))}
          </View>
          <T variant="body-sm" tone="muted">
            The meal works without these. They make it a proper meal.
          </T>
        </Section>
      ) : null}

      <Section title="Method">
        {card.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <Num variant="num" tone="muted" style={styles.stepNum}>
              {i + 1}
            </Num>
            <T variant="body" style={styles.grow}>
              {step}
            </T>
          </View>
        ))}
      </Section>

      <SwapSheet
        group={swapGroup}
        currentId={swapGroup ? (choices[swapGroup] ?? pricer.options(swapGroup)[0]?.id) : undefined}
        options={swapGroup ? pricer.options(swapGroup) : []}
        onPick={(id) => {
          if (swapGroup) setChoices((c) => ({ ...c, [swapGroup]: id }));
          setSwapGroup(null);
        }}
        onClose={() => setSwapGroup(null)}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <T variant="title-sm" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

/** Other items in the same group, cheapest first (SPEC §6: tap an item to swap it). */
function SwapSheet(props: {
  group: string | null;
  /** The item in use: the one picked here, else the cheapest (what pricing chose). */
  currentId: string | undefined;
  options: { id: string; name: string; unit: string; price: number }[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={props.group !== null} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.scrim} onPress={props.onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <T variant="title-sm">Swap {props.group ? (LABEL.get(props.group) ?? props.group).toLowerCase() : ""}</T>
        <ScrollView contentContainerStyle={styles.sheetList}>
          {props.options.map((o) => (
            <View key={o.id} style={styles.optionRow}>
              <View style={styles.grow}>
                <OptionRow label={o.name} hint={`${o.unit} · ${money(o.price)}`} selected={o.id === props.currentId} onPress={() => props.onPick(o.id)} />
              </View>
            </View>
          ))}
        </ScrollView>
        <Button kind="text" label="Keep this one" onPress={props.onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  photo: {
    overflow: "hidden",
    aspectRatio: 4 / 3,
    borderRadius: radius["radius-lg"],
    backgroundColor: color["surface-soft"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space["space-2"],
  },
  block: { gap: space["space-2"] },
  meta: { flexDirection: "row", alignItems: "center", gap: space["space-1"] },
  card: { backgroundColor: color.surface, borderRadius: radius["radius-lg"], padding: space["space-4"] },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space["space-3"] },
  row: { minHeight: size.touch, flexDirection: "row", alignItems: "center", gap: space["space-3"], paddingVertical: space["space-3"] },
  divider: { borderTopWidth: size.border, borderTopColor: color.hairline },
  grow: { flex: 1 },
  step: { flexDirection: "row", gap: space["space-3"] },
  stepNum: { minWidth: space["space-4"] },
  center: { textAlign: "center" },
  scrim: { flex: 1, backgroundColor: color.ink, opacity: 0.3 },
  sheet: {
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius["radius-lg"],
    borderTopRightRadius: radius["radius-lg"],
    padding: space["space-4"],
    gap: space["space-3"],
    maxHeight: "70%",
  },
  sheetList: { gap: space["space-2"] },
  optionRow: { flexDirection: "row" },
});
