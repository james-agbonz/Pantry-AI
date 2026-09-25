import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
  /** A control at the top right, e.g. the Settings button on Home. */
  barRight?: ReactNode;
  /** e.g. "2 of 4". */
  step?: string;
  intro?: string;
  back?: boolean;
  /** Actions pinned below the content, primary last so it sits nearest the thumb. */
  footer?: ReactNode;
  children?: ReactNode;
}

/** A screen on `canvas` with `space-4` gutters (DESIGN.md › Shape and space). */
export function Screen({ title, titleVariant = "display", hero, barRight, step, intro, back = false, footer, children }: Props) {
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
          <T variant="caption" tone="muted" style={styles.step}>
            {step}
          </T>
        ) : (
          barRight ?? null
        )}
      </View>
      {/*
        On a phone the keyboard would cover the sticky footer, where Home's budget
        field lives: lift the screen above it. Dragging the page closes the
        keyboard, since the number pad has no Done key.
      */}
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  fill: { flex: 1 },
  bar: {
    minHeight: size.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space["space-2"],
  },
  step: { marginRight: space["space-2"] },
  back: { width: size.touch, height: size.touch, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: space["space-4"], paddingTop: space["space-4"], paddingBottom: space["space-8"], gap: space["space-2"] },
  body: { marginTop: space["space-4"], gap: space["space-6"] },
  footer: { paddingHorizontal: space["space-4"], paddingTop: space["space-3"], paddingBottom: space["space-4"], gap: space["space-3"] },
});
