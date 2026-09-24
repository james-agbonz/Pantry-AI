import { router } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Stepper } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { SERVINGS, toProfile } from "@/onboarding/answers";
import { useOnboarding } from "@/onboarding/context";
import { useProfile } from "@/state/profile";

/** Screen 4: cooking for, default 1. "Done" is the one tap through. Saves the profile. */
export default function CookingFor() {
  const { answers, dispatch } = useOnboarding();
  const { save } = useProfile();
  const [saving, setSaving] = useState(false);

  const done = async () => {
    setSaving(true);
    try {
      await save(toProfile(answers));
      router.replace("/home");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Cooking for how many?"
      step="4 of 4"
      back
      footer={<Button label="Done" disabled={saving || answers.goal === null} onPress={done} />}
    >
      <Stepper
        value={answers.servings}
        min={SERVINGS.min}
        max={SERVINGS.max}
        unit={answers.servings === 1 ? "person" : "people"}
        onChange={(n) => dispatch({ type: "servings", servings: n })}
      />
      <T variant="body-sm" tone="muted" style={{ textAlign: "center" }}>
        Amounts in each meal are for this many.
      </T>
    </Screen>
  );
}
