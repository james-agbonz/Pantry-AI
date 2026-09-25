import type { DealStage } from "@pantry/contract";
import { router } from "expo-router";
import { Check, Circle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { DealError, type DealFailure } from "@/data/sources";
import { STAGES, stepStates } from "@/deck/stages";
import { useProfile } from "@/state/profile";
import { useSession } from "@/state/session";
import { color, size, space } from "@/theme";

/**
 * What each failure says. Only a server-side failure says no deck was
 * counted: after a lost connection the server may have counted it (the model
 * was already working), so that message doesn't promise either way.
 */
const FAILURE_COPY: Record<DealFailure, { title: string; intro: string; retry: boolean }> = {
  daily_limit: { title: "That's today's decks", intro: "Three a day, free. More tomorrow.", retry: false },
  rate_limit: { title: "Too many tries", intro: "Wait a minute, then try again.", retry: true },
  busy: { title: "Pantry is busy", intro: "A lot of people are dealing right now. Try again in a little while.", retry: true },
  server: { title: "That didn't work", intro: "Something went wrong on our side. No deck was counted.", retry: true },
  no_cards: { title: "No meals this time", intro: "None of the meals passed our checks. No deck was counted. Try again, or change what you have.", retry: true },
  network: { title: "Couldn't reach Pantry", intro: "Check your connection and try again.", retry: true },
  bad_request: { title: "That didn't work", intro: "Something in the request wasn't right. Go back and try again.", retry: false },
  bad_date: { title: "Check your phone's date", intro: "Your phone's date looks wrong. Set it to today, then try again.", retry: true },
};

/**
 * Loading (SPEC §2): four steps, one per pipeline stage. Each ticks when the
 * deck source reports that stage finished, never on a timer.
 */
export default function Loading() {
  const { profile } = useProfile();
  const s = useSession();
  const [done, setDone] = useState<ReadonlySet<DealStage>>(new Set());
  const [failed, setFailed] = useState<DealFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const session = s.toSession();
    if (!profile || !session) {
      router.replace("/home");
      return;
    }
    let live = true;
    setFailed(null);
    setDone(new Set());
    s.decks
      .deal(profile, session, { onStage: (stage) => live && setDone((d) => new Set(d).add(stage)) })
      .then(async ({ cards, left }) => {
        if (!live) return;
        await s.countDealt(left);
        s.dispatch({ type: "dealt", cards });
        router.replace("/deck");
      })
      .catch(async (e) => {
        if (!live) return;
        const reason = e instanceof DealError ? e.reason : "network";
        // The server says today's decks are used: make the phone's count agree.
        if (reason === "daily_limit") await s.countDealt(0);
        setFailed(reason);
      });
    return () => {
      live = false;
    };
    // Deal once per attempt; the session is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (failed) {
    const { title, intro, retry } = FAILURE_COPY[failed];
    return (
      <Screen
        title={title}
        intro={intro}
        footer={
          retry ? (
            <>
              <Button kind="secondary" label="Back to home" onPress={() => router.replace("/home")} />
              <Button label="Try again" onPress={() => setAttempt((n) => n + 1)} />
            </>
          ) : (
            <Button label="Back to home" onPress={() => router.replace("/home")} />
          )
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
