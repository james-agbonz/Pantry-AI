import { Stack } from "expo-router";
import { OnboardingProvider } from "@/onboarding/context";
import { color } from "@/theme";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
    </OnboardingProvider>
  );
}
