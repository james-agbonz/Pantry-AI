import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, size, space } from "@/theme";
import { T } from "./Text";

interface Props {
  /** The question the screen asks, in `display`. One per screen. */
  title: string;
  /** `title` for a screen named after a meal (DESIGN.md › Type). */
  titleVariant?: "display" | "title";
  /** Shown above the title, full width, e.g. the meal photo. */
  hero?: ReactNode;
  /** e.g. "2 of 4". */
  step?: string;
  intro?: string;
  back?: boolean;
  /** Actions pinned below the content, primary last so it sits nearest the thumb. */
  footer?: ReactNode;
  children?: ReactNode;
}

/** A screen on `canvas` with `space-4` gutters (DESIGN.md › Shape and space). */
export function Screen({ title, titleVariant = "display", hero, step, intro, back = false, footer, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.bar}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
            <ChevronLeft size={size.iconLg} strokeWidth={size.iconStroke} color={color.ink} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        {step ? (
          <T variant="caption" tone="muted">
            {step}
          </T>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {hero}
        <T variant={titleVariant} accessibilityRole="header">
          {title}
        </T>
        {intro ? (
          <T variant="body" tone="muted">
            {intro}
          </T>
        ) : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  bar: {
    minHeight: size.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space["space-2"],
    paddingRight: space["space-4"],
  },
  back: { width: size.touch, height: size.touch, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: space["space-4"], paddingTop: space["space-4"], paddingBottom: space["space-8"], gap: space["space-2"] },
  body: { marginTop: space["space-4"], gap: space["space-6"] },
  footer: { paddingHorizontal: space["space-4"], paddingTop: space["space-3"], paddingBottom: space["space-4"], gap: space["space-3"] },
});
