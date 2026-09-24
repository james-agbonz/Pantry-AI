import { computeTargets } from "@pantry/needs";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip, OptionRow } from "@/components/Choice";
import { TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { ACTIVITIES, EMPTY_FORM, readStats, SEXES, switchUnits, type StatsForm } from "@/meal/bodyStats";
import { useProfile } from "@/state/profile";
import { space } from "@/theme";

/**
 * Body stats (SPEC §3): asked after the first meal is picked, for cut, bulk
 * or condition, and required for those goals, so there's no skip. Their only
 * job is working out daily targets (SPEC §8); only the targets are kept.
 * Settings opens it again with `?from=settings` ("Redo my numbers").
 */
export default function BodyStats() {
  const { profile, save } = useProfile();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === "settings";
  const [form, setForm] = useState<StatsForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  if (!profile) return <Redirect href="/" />;

  const set = <K extends keyof StatsForm>(k: K, v: StatsForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const read = readStats(form);

  const submit = async () => {
    if (!read.ok) return;
    setSaving(true);
    try {
      const targets = computeTargets({ goal: profile.goal, condition: profile.condition, stats: read.stats });
      await save({ ...profile, targets });
      if (fromSettings) router.back();
      else router.replace("/meal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="What are your numbers?"
      intro="They set your daily calories and protein. Only those two targets are kept, on this phone."
      back={fromSettings}
      footer={
        <>
          <T variant="body-sm" tone="muted" style={styles.center}>
            {read.ok ? (fromSettings ? "Saving updates your daily targets." : "Your meal is next.") : read.fix}
          </T>
          <Button label="Save" disabled={!read.ok || saving} onPress={submit} />
        </>
      }
    >
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Units">
        <Chip label="cm · kg" selected={form.units === "metric"} onPress={() => setForm((f) => switchUnits(f, "metric"))} />
        <Chip label="ft · lb" selected={form.units === "imperial"} onPress={() => setForm((f) => switchUnits(f, "imperial"))} />
      </View>

      <View style={styles.fields}>
        {form.units === "metric" ? (
          <>
            <Field label="Height" unit="cm" value={form.height_cm} onChange={(v) => set("height_cm", v)} />
            <Field label="Weight" unit="kg" value={form.weight_kg} onChange={(v) => set("weight_kg", v)} />
          </>
        ) : (
          <>
            <View style={styles.field}>
              <T variant="label">Height</T>
              <View style={styles.inputRow}>
                <TextField value={form.height_ft} onChangeText={(v) => set("height_ft", v)} keyboardType="number-pad" accessibilityLabel="Height, feet" style={styles.grow} />
                <T variant="caption" tone="muted" style={styles.unit}>
                  ft
                </T>
                <TextField value={form.height_in} onChangeText={(v) => set("height_in", v)} keyboardType="number-pad" accessibilityLabel="Height, inches" style={styles.grow} />
                <T variant="caption" tone="muted" style={styles.unit}>
                  in
                </T>
              </View>
            </View>
            <Field label="Weight" unit="lb" value={form.weight_lb} onChange={(v) => set("weight_lb", v)} />
          </>
        )}
        <Field label="Age" unit="years" value={form.age} onChange={(v) => set("age", v)} integer />
      </View>

      <View style={styles.group}>
        <T variant="title-sm">Sex</T>
        <View style={styles.wrap}>
          {SEXES.map((s) => (
            <Chip key={s.value} label={s.label} selected={form.sex === s.value} onPress={() => set("sex", s.value)} />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <T variant="title-sm">How active are you?</T>
        {ACTIVITIES.map((a) => (
          <OptionRow key={a.value} label={a.label} hint={a.hint} selected={form.activity === a.value} onPress={() => set("activity", a.value)} />
        ))}
      </View>

      <View style={styles.group}>
        {form.units === "metric" ? (
          <Field label="Target weight" unit="kg" value={form.target_kg} onChange={(v) => set("target_kg", v)} optional />
        ) : (
          <Field label="Target weight" unit="lb" value={form.target_lb} onChange={(v) => set("target_lb", v)} optional />
        )}
        <T variant="body-sm" tone="muted">
          On a cut, protein follows your target weight when it's below your weight now.
        </T>
      </View>
    </Screen>
  );
}

function Field(props: { label: string; unit: string; value: string; onChange: (v: string) => void; integer?: boolean; optional?: boolean }) {
  return (
    <View style={styles.field}>
      <T variant="label" style={styles.fieldLabel}>
        {props.label}
        {props.optional ? (
          <T variant="body-sm" tone="muted">
            {"  "}optional
          </T>
        ) : null}
      </T>
      <View style={styles.inputRow}>
        <TextField
          value={props.value}
          onChangeText={props.onChange}
          keyboardType={props.integer ? "number-pad" : "decimal-pad"}
          accessibilityLabel={`${props.label} in ${props.unit}${props.optional ? ", optional" : ""}`}
          style={styles.grow}
        />
        <T variant="caption" tone="muted" style={styles.unit}>
          {props.unit}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space["space-3"] },
  field: { gap: space["space-1"] },
  fieldLabel: {},
  inputRow: { flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  unit: { minWidth: space["space-8"] },
  // flexBasis 0 and minWidth 0: web inputs otherwise keep their natural width and push the row off screen.
  grow: { flex: 1, flexBasis: 0, minWidth: 0 },
  group: { gap: space["space-2"] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
  center: { textAlign: "center" },
});
