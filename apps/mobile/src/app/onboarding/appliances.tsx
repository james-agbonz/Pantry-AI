import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Tile } from "@/components/Choice";
import { Screen } from "@/components/Screen";
import { useOnboarding } from "@/onboarding/context";
import { APPLIANCE_ICONS } from "@/onboarding/icons";
import { APPLIANCES } from "@/onboarding/options";
import { space } from "@/theme";

/**
 * Screen 3: appliances, many. Tiles stand in for the kitchen illustration.
 * One tap through: the typical stove, fridge and microwave.
 */
export default function Appliances() {
  const { answers, dispatch } = useOnboarding();
  const next = () => router.push("/onboarding/cooking-for");

  return (
    <Screen
      title="What can you cook with?"
      intro="Tap what you have. A knife, pan, bowl and plate are a given."
      step="3 of 4"
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
      <View style={styles.grid}>
        {APPLIANCES.map((a) => (
          <Tile
            key={a.method}
            label={a.label}
            icon={APPLIANCE_ICONS[a.method]}
            selected={answers.appliances.includes(a.method)}
            onPress={() => dispatch({ type: "toggle_appliance", method: a.method })}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
});
