import { Redirect } from "expo-router";
import { View } from "react-native";
import { useProfile } from "@/state/profile";
import { color } from "@/theme";

/** Onboarding once, then straight to Home (SPEC §2). */
export default function Index() {
  const { profile } = useProfile();
  if (profile === undefined) return <View style={{ flex: 1, backgroundColor: color.canvas }} />;
  return <Redirect href={profile ? "/home" : "/onboarding/goal"} />;
}
