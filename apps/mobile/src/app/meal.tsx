import { Redirect, router } from "expo-router";
import { Button } from "@/components/Button";
import { MealCard } from "@/components/MealCard";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { useSession } from "@/state/session";

/** Placeholder until step 5c builds the meal screen: shows the meal that was picked. */
export default function Meal() {
  const { selected } = useSession();
  if (!selected) return <Redirect href="/home" />;
  return (
    <Screen
      title="Your meal"
      intro="The full meal screen (what to buy, method, shopping list) arrives in step 5c."
      footer={<Button kind="text" only label="Back to home" onPress={() => router.replace("/home")} />}
    >
      <MealCard item={selected} photo={null} />
      <T variant="body-sm" tone="muted">
        Prices are typical, not quotes.
      </T>
    </Screen>
  );
}
