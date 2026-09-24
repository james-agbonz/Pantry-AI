import { computeTargets } from "@pantry/needs";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip, OptionRow } from "@/components/Choice";
import { TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { ACTIVITIES, EMPTY_FORM, readStats, SEXES, type StatsForm } from "@/meal/bodyStats";
import { useProfile } from "@/state/profile";
import { space } from "@/theme";

/**
 * Body stats (SPEC §3): asked after the first meal is picked, for cut, bulk
 * or condition, and required for those goals, so there's no skip. Their only
 * job is working out daily targets (SPEC §8); only the targets are kept.
 */
export default function BodyStats() {
  const { profile, save } = useProfile();
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
      router.replace("/meal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="What are your numbers?"
      intro="They set your daily calories and protein. Only those two targets are kept, on this phone."
      footer={
        <>
          <T variant="body-sm" tone="muted" style={styles.center}>
            {read.ok ? "Your meal is next." : read.fix}
          </T>
          <Button label="Save" disabled={!read.ok || saving} onPress={submit} />
        </>
      }
    >
      <View style={styles.fields}>
        <Field label="Height" unit="cm" value={form.height_cm} onChange={(v) => set("height_cm", v)} />
        <Field label="Weight" unit="kg" value={form.weight_kg} onChange={(v) => set("weight_kg", v)} />
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
        <Field label="Target weight" unit="kg" value={form.target_kg} onChange={(v) => set("target_kg", v)} optional />
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
  grow: { flex: 1 },
  group: { gap: space["space-2"] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
  center: { textAlign: "center" },
});
