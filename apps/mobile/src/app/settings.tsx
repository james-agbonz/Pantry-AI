import { Redirect, router } from "expo-router";
import { useReducer, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip, OptionRow, Tile } from "@/components/Choice";
import { Stepper, TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { Num, T } from "@/components/Text";
import { whole } from "@/format";
import { reduce, SERVINGS } from "@/onboarding/answers";
import { APPLIANCE_ICONS } from "@/onboarding/icons";
import { APPLIANCES, CONDITION_LABEL, CONDITIONS, GOALS, LIMITS } from "@/onboarding/options";
import { applySettings, fromProfile, isDirty } from "@/settings/apply";
import { useProfile } from "@/state/profile";
import { space } from "@/theme";

/**
 * Settings: edit what onboarding asked (goal, hard limits, appliances,
 * cooking for) with the same controls, and redo the body stats. Changes
 * apply when saved.
 */
export default function Settings() {
  const { profile } = useProfile();
  // Lives here, not in the form: saving remounts the form, and the note must survive that.
  const [note, setNote] = useState<string | null>(null);
  if (!profile) return <Redirect href="/" />;
  // Keyed on the saved profile: after a save, or after Redo my numbers, the form starts from what's saved.
  return <SettingsForm key={JSON.stringify(profile)} note={note} setNote={setNote} />;
}

function SettingsForm({ note, setNote }: { note: string | null; setNote: (n: string | null) => void }) {
  const { profile, save } = useProfile();
  const saved = profile!;
  const [answers, dispatch] = useReducer(reduce, saved, fromProfile);
  const [draft, setDraft] = useState("");
  const [conditionOpen, setConditionOpen] = useState(answers.goal === "condition");
  const dirty = isDirty(saved, answers);

  const submit = async () => {
    const { profile: next, targetsCleared } = applySettings(saved, answers);
    setNote(null);
    await save(next);
    setNote(
      targetsCleared
        ? next.goal === "eat_well"
          ? "Saved. Eat well doesn't use daily targets, so they were cleared."
          : "Saved. Your goal changed, so tap Redo my numbers to set new daily targets."
        : "Saved.",
    );
  };

  const addOther = () => {
    dispatch({ type: "add_other", text: draft });
    setDraft("");
  };

  const asksNumbers = saved.goal !== "eat_well";

  return (
    <Screen
      title="Settings"
      back
      footer={
        <>
          <T variant="body-sm" tone="muted" style={styles.center} accessibilityLiveRegion="polite">
            {dirty ? "Changes apply to your next deck." : (note ?? "No changes yet")}
          </T>
          <Button label="Save changes" disabled={!dirty} onPress={submit} />
        </>
      }
    >
      <Section title="Goal">
        {GOALS.map((g) => (
          <OptionRow
            key={g.goal}
            label={g.label}
            hint={g.hint}
            selected={answers.goal === g.goal}
            onPress={() => {
              dispatch({ type: "goal", goal: g.goal });
              setConditionOpen(false);
            }}
          />
        ))}
        <OptionRow label={CONDITION_LABEL} selected={answers.goal === "condition" || conditionOpen} onPress={() => setConditionOpen(true)} />
        {conditionOpen ? (
          <View style={styles.indent}>
            {CONDITIONS.map((c) => (
              <OptionRow key={c.condition} label={c.label} selected={answers.condition === c.condition} onPress={() => dispatch({ type: "condition", condition: c.condition })} />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Daily targets">
        <Num variant="num" tone={saved.targets ? "ink" : "muted"}>
          {saved.targets ? `~${whole(saved.targets.kcal)} kcal · ~${whole(saved.targets.protein)} g protein` : "Not set"}
        </Num>
        {asksNumbers ? (
          <>
            <Button
              kind="secondary"
              label="Redo my numbers"
              disabled={dirty}
              onPress={() => {
                setNote(null);
                router.push("/body-stats?from=settings");
              }}
            />
            {dirty ? (
              <T variant="body-sm" tone="muted">
                Save your changes first.
              </T>
            ) : null}
          </>
        ) : (
          <T variant="body-sm" tone="muted">
            Eat well steers by the goal alone.
          </T>
        )}
      </Section>

      <Section title="Never eat">
        <View style={styles.wrap}>
          {LIMITS.map((l) => (
            <Chip key={l.limit} label={l.label} selected={answers.limits.includes(l.limit)} onPress={() => dispatch({ type: "toggle_limit", limit: l.limit })} />
          ))}
          {answers.limits_other.map((t) => (
            <Chip key={t} label={t} selected onPress={() => dispatch({ type: "remove_other", text: t })} />
          ))}
        </View>
        <View style={styles.addRow}>
          <TextField value={draft} onChangeText={setDraft} onSubmitEditing={addOther} placeholder="Something else, e.g. cilantro" accessibilityLabel="Something else you never eat" style={styles.grow} />
          <Button kind="text" label="Add" disabled={!draft.trim()} onPress={addOther} />
        </View>
      </Section>

      <Section title="Cook with">
        <View style={styles.wrap}>
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
      </Section>

      <Section title="Cooking for">
        <Stepper
          value={answers.servings}
          min={SERVINGS.min}
          max={SERVINGS.max}
          unit={answers.servings === 1 ? "person" : "people"}
          onChange={(n) => dispatch({ type: "servings", servings: n })}
        />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <T variant="title-sm" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space["space-2"] },
  indent: { gap: space["space-2"], paddingLeft: space["space-4"] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
  addRow: { flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  grow: { flex: 1 },
  center: { textAlign: "center" },
});
