import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { OptionRow } from "@/components/Choice";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { toProfile } from "@/onboarding/answers";
import { useOnboarding } from "@/onboarding/context";
import { PROVINCES } from "@/onboarding/options";
import { useProfile } from "@/state/profile";
import { space } from "@/theme";

/**
 * Screen 5: where you shop, for regional prices (SPEC §3, §9). Only the
 * province, kept on the phone. "Skip" is the one tap through: prices stay
 * Canada-wide. Saves the profile.
 */
export default function ProvinceScreen() {
  const { answers, dispatch } = useOnboarding();
  const { save } = useProfile();
  const [saving, setSaving] = useState(false);

  const done = async (skip: boolean) => {
    setSaving(true);
    try {
      await save(toProfile(skip ? { ...answers, province: null } : answers));
      router.replace("/home");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Where do you shop?"
      step="5 of 5"
      back
      footer={
        <>
          <Button label="Done" disabled={saving || answers.goal === null || answers.province === null} onPress={() => done(false)} />
          <Button kind="text" label="Skip, use Canada-wide prices" disabled={saving || answers.goal === null} onPress={() => done(true)} />
        </>
      }
    >
      <T variant="body" tone="muted">
        Prices differ by province. We only ask for the province, and it stays on your phone.
      </T>
      <View style={{ gap: space["space-2"] }}>
        {PROVINCES.map((p) => (
          <OptionRow key={p.province} label={p.label} selected={answers.province === p.province} onPress={() => dispatch({ type: "province", province: p.province })} />
        ))}
      </View>
    </Screen>
  );
}
