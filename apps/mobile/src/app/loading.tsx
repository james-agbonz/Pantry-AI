import type { DealStage } from "@pantry/contract";
import { router } from "expo-router";
import { Check, Circle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { STAGES, stepStates } from "@/deck/stages";
import { useProfile } from "@/state/profile";
import { useSession } from "@/state/session";
import { color, size, space } from "@/theme";

/**
 * Loading (SPEC §2): four steps, one per pipeline stage. Each ticks when the
 * deck source reports that stage finished, never on a timer.
 */
export default function Loading() {
  const { profile } = useProfile();
  const s = useSession();
  const [done, setDone] = useState<ReadonlySet<DealStage>>(new Set());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const session = s.toSession();
    if (!profile || !session) {
      router.replace("/home");
      return;
    }
    let live = true;
    setFailed(false);
    setDone(new Set());
    s.decks
      .deal(profile, session, { onStage: (stage) => live && setDone((d) => new Set(d).add(stage)) })
      .then(async (cards) => {
        if (!live) return;
        await s.countDealt();
        s.dispatch({ type: "dealt", cards });
        router.replace("/deck");
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // Deal once per attempt; the session is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (failed) {
    return (
      <Screen
        title="That didn't work"
        intro="No deck was counted. Check your connection and try again."
        footer={
          <>
            <Button kind="secondary" label="Back to home" onPress={() => router.replace("/home")} />
            <Button label="Try again" onPress={() => setAttempt((n) => n + 1)} />
          </>
        }
      />
    );
  }

  const states = stepStates(done);
  return (
    <Screen title="Dealing your meals">
      <View style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STAGES.length, now: done.size }}>
        {STAGES.map((st, i) => {
          const state = states[i];
          return (
            <View key={st.stage} style={styles.step}>
              <View style={styles.mark}>
                {state === "done" ? (
                  <Check size={size.icon} strokeWidth={size.iconStroke} color={color.ink} />
                ) : state === "active" ? (
                  <ActivityIndicator size="small" color={color.primary} />
                ) : (
                  <Circle size={size.icon} strokeWidth={size.iconStroke} color={color["border-strong"]} />
                )}
              </View>
              <T variant="body" tone={state === "waiting" ? "muted" : "ink"}>
                {st.label}
              </T>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space["space-3"] },
  step: { minHeight: size.touch, flexDirection: "row", alignItems: "center", gap: space["space-3"] },
  mark: { width: size.icon, alignItems: "center" },
});
