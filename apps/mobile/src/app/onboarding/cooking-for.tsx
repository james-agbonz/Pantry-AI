import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Stepper } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { SERVINGS } from "@/onboarding/answers";
import { useOnboarding } from "@/onboarding/context";

/** Screen 4: cooking for, default 1. "Next" is the one tap through. */
export default function CookingFor() {
  const { answers, dispatch } = useOnboarding();

  return (
    <Screen title="Cooking for how many?" step="4 of 5" back footer={<Button label="Next" onPress={() => router.push("/onboarding/province")} />}>
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
