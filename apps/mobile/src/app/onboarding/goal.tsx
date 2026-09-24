import { router } from "expo-router";
import { View } from "react-native";
import { OptionRow } from "@/components/Choice";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { useOnboarding } from "@/onboarding/context";
import { CONDITION_LABEL, CONDITIONS, GOALS } from "@/onboarding/options";
import { space } from "@/theme";
import { useState } from "react";

/** Screen 1: one goal. Tapping an answer moves on: that's the one-tap way through. */
export default function Goal() {
  const { answers, dispatch } = useOnboarding();
  const [conditionOpen, setConditionOpen] = useState(answers.goal === "condition");
  const next = () => router.push("/onboarding/limits");

  return (
    <Screen title="What's the goal?" step="1 of 4">
      <View style={{ gap: space["space-2"] }}>
        {GOALS.map((g) => (
          <OptionRow
            key={g.goal}
            label={g.label}
            hint={g.hint}
            selected={answers.goal === g.goal}
            onPress={() => {
              dispatch({ type: "goal", goal: g.goal });
              setConditionOpen(false);
              next();
            }}
          />
        ))}
        <OptionRow
          label={CONDITION_LABEL}
          hint="Meals shaped around it"
          selected={answers.goal === "condition" || conditionOpen}
          onPress={() => setConditionOpen(true)}
        />
      </View>
      {conditionOpen ? (
        <View style={{ gap: space["space-2"] }}>
          <T variant="title-sm">Which one?</T>
          {CONDITIONS.map((c) => (
            <OptionRow
              key={c.condition}
              label={c.label}
              selected={answers.condition === c.condition}
              onPress={() => {
                dispatch({ type: "condition", condition: c.condition });
                next();
              }}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
