import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { useProfile } from "@/state/profile";
import { useSession } from "@/state/session";
import { color, space } from "@/theme";

/** Loading (SPEC §2): engine → validate → price → sort, then the deck. */
export default function Loading() {
  const { profile } = useProfile();
  const s = useSession();
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
    s.decks
      .deal(profile, session)
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

  return (
    <Screen title="Dealing your meals" intro="Checking each one against what you never eat, then pricing it.">
      <View style={styles.spin}>
        <ActivityIndicator size="large" color={color.primary} accessibilityLabel="Loading" />
        <T variant="body-sm" tone="muted">
          Six meals, sorted by what fits your budget.
        </T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spin: { alignItems: "center", gap: space["space-4"], paddingTop: space["space-8"] },
});
