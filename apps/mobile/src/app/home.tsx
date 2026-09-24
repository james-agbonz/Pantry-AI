import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { APPLIANCES, CONDITIONS, GOALS, LIMITS } from "@/onboarding/options";
import { useProfile } from "@/state/profile";
import { space } from "@/theme";

/** Placeholder until step 5b builds Home: shows the saved profile so onboarding can be checked. */
export default function Home() {
  const { profile, clear } = useProfile();
  if (!profile) return null;

  const goal =
    profile.goal === "condition"
      ? `Managing a condition: ${CONDITIONS.find((c) => c.condition === profile.condition)?.label.toLowerCase()}`
      : GOALS.find((g) => g.goal === profile.goal)?.label;
  const limits = [...profile.limits.map((l) => LIMITS.find((x) => x.limit === l)?.label), ...profile.limits_other];
  const appliances = profile.appliances.map((m) => APPLIANCES.find((a) => a.method === m)?.label);

  const rows: [string, string][] = [
    ["Goal", goal ?? ""],
    ["Hard limits", limits.length ? limits.join(", ") : "No limits"],
    ["Cook with", appliances.length ? appliances.join(", ") : "No appliances"],
    ["Cooking for", String(profile.servings)],
  ];

  return (
    <Screen
      title="What's in the fridge?"
      intro="Home and the deck arrive in step 5b. This is the profile onboarding saved."
      footer={
        <Button
          kind="text"
          only
          label="Redo setup"
          onPress={async () => {
            await clear();
            router.replace("/onboarding/goal");
          }}
        />
      }
    >
      <View style={{ gap: space["space-3"] }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ gap: space["space-1"] }}>
            <T variant="caption" tone="muted">
              {k}
            </T>
            <T variant="body">{v}</T>
          </View>
        ))}
      </View>
    </Screen>
  );
}
