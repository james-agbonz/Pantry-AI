import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Choice";
import { TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { useOnboarding } from "@/onboarding/context";
import { LIMITS } from "@/onboarding/options";
import { space } from "@/theme";

/** Screen 2: hard limits, many. "No limits" is the one-tap way through. */
export default function Limits() {
  const { answers, dispatch } = useOnboarding();
  const [draft, setDraft] = useState("");
  const next = () => router.push("/onboarding/appliances");
  const add = () => {
    dispatch({ type: "add_other", text: draft });
    setDraft("");
  };
  const any = answers.limits.length > 0 || answers.limits_other.length > 0;

  return (
    <Screen
      title="Anything you never eat?"
      intro="These are never in a meal, not even a pinch."
      step="2 of 4"
      back
      footer={
        <>
          <Button
            kind="secondary"
            label="No limits"
            onPress={() => {
              dispatch({ type: "no_limits" });
              next();
            }}
          />
          <Button label="Next" disabled={!any} onPress={next} />
        </>
      }
    >
      <View style={styles.wrap}>
        {LIMITS.map((l) => (
          <Chip key={l.limit} label={l.label} selected={answers.limits.includes(l.limit)} onPress={() => dispatch({ type: "toggle_limit", limit: l.limit })} />
        ))}
      </View>
      <View style={styles.other}>
        <T variant="title-sm">Something else</T>
        <View style={styles.addRow}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder="e.g. cilantro"
            returnKeyType="done"
            accessibilityLabel="Something else you never eat"
            style={styles.field}
          />
          <Button kind="text" label="Add" disabled={!draft.trim()} onPress={add} />
        </View>
        {answers.limits_other.length ? (
          <View style={styles.wrap}>
            {answers.limits_other.map((t) => (
              <Chip key={t} label={t} selected onPress={() => dispatch({ type: "remove_other", text: t })} />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
  other: { gap: space["space-2"] },
  addRow: { flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  field: { flex: 1 },
});
