import { router } from "expo-router";
import { Button } from "@/components/Button";
import { KitchenPicker } from "@/components/KitchenPicker";
import { Screen } from "@/components/Screen";
import { useOnboarding } from "@/onboarding/context";

/**
 * Screen 3: appliances, many, tapped on the kitchen illustration.
 * One tap through: the typical stove, fridge and microwave.
 */
export default function Appliances() {
  const { answers, dispatch } = useOnboarding();
  const next = () => router.push("/onboarding/cooking-for");

  return (
    <Screen
      title="What can you cook with?"
      intro="Tap what you have. A knife, pan, bowl and plate are a given."
      step="3 of 5"
      back
      footer={
        <>
          <Button
            kind="text"
            label="None of these"
            onPress={() => {
              dispatch({ type: "no_appliances" });
              next();
            }}
          />
          <Button
            kind="secondary"
            label="Stove, fridge and microwave"
            onPress={() => {
              dispatch({ type: "typical_kitchen" });
              next();
            }}
          />
          <Button label="Next" disabled={answers.appliances.length === 0} onPress={next} />
        </>
      }
    >
      <KitchenPicker selected={answers.appliances} onToggle={(method) => dispatch({ type: "toggle_appliance", method })} />
    </Screen>
  );
}
