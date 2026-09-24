import { excludeTerms } from "@pantry/contract";
import { vocabulary } from "@pantry/vocabulary";
import { router } from "expo-router";
import { ChevronDown, ChevronRight, Plus, Settings } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Choice";
import { TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { Num, T } from "@/components/Text";
import { decksLeftText } from "@/deck/state";
import { dealBlocker } from "@/home/deal";
import { OPEN_BY_DEFAULT, search, sections } from "@/home/groups";
import { useProfile } from "@/state/profile";
import { useSession } from "@/state/session";
import { color, radius, size, space } from "@/theme";

const LABEL = new Map(vocabulary.groups.map((g) => [g.id, g.label]));

/**
 * Home (SPEC §4): tap what you have, enter a budget, deal. Search on top;
 * families as collapsible sections with the everyday ones open.
 */
export default function Home() {
  const s = useSession();
  const { profile } = useProfile();
  const exclude = useMemo(() => (profile ? excludeTerms(profile) : []), [profile]);
  const secs = useMemo(() => sections(vocabulary, exclude), [exclude]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(OPEN_BY_DEFAULT));
  const results = useMemo(() => search(vocabulary, query, exclude), [query, exclude]);

  const toggleFamily = (f: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const addFree = (text: string) => {
    s.dispatch({ type: "add_other", text });
    setQuery("");
  };

  const picked = s.have.length + s.have_other.length;
  const blocker = dealBlocker({ decksLeft: s.decksLeft, picked, budget: s.budget });

  return (
    <Screen
      title="What's in the fridge?"
      barRight={
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push("/settings")} style={styles.iconBtn}>
          <Settings size={size.iconLg} strokeWidth={size.iconStroke} color={color.ink} />
        </Pressable>
      }
      footer={
        <>
          <View style={styles.budgetRow}>
            <T variant="title-sm">Budget</T>
            <View style={styles.money}>
              <Num variant="num" tone="muted">
                $
              </Num>
              <TextField
                value={s.budgetText}
                onChangeText={(t) => s.dispatch({ type: "budget", text: t })}
                keyboardType="decimal-pad"
                placeholder="15"
                accessibilityLabel="Budget in Canadian dollars"
                style={styles.grow}
              />
              <T variant="caption" tone="muted">
                CAD
              </T>
            </View>
          </View>
          <T variant="body-sm" tone="muted" style={styles.center}>
            {blocker ?? (s.decksLeft !== undefined ? decksLeftText(s.decksLeft) : " ")}
          </T>
          <Button label="Deal me meals" disabled={blocker !== null} onPress={() => router.push("/loading")} />
        </>
      }
    >
      <View style={styles.block}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search, e.g. chicken"
          accessibilityLabel="Search what you have"
          returnKeyType="done"
          onSubmitEditing={() => results.freeText && results.groups.length === 0 && addFree(results.freeText)}
        />
        {query.trim() ? (
          <View style={styles.wrap}>
            {results.groups.map((g) => (
              <Chip key={g.id} label={g.label} selected={s.have.includes(g.id)} onPress={() => s.dispatch({ type: "toggle_have", group: g.id })} />
            ))}
            {results.freeText ? <AddChip text={results.freeText} onPress={() => addFree(results.freeText!)} /> : null}
          </View>
        ) : null}
      </View>

      {picked > 0 ? (
        <View style={styles.block}>
          <View style={styles.headRow}>
            <T variant="title-sm">You have</T>
            <Num variant="num-sm" tone="muted">
              {picked}
            </Num>
          </View>
          <View style={styles.wrap}>
            {s.have.map((g) => (
              <Chip key={g} label={LABEL.get(g) ?? g} selected onPress={() => s.dispatch({ type: "toggle_have", group: g })} />
            ))}
            {s.have_other.map((t) => (
              <Chip key={t} label={t} selected onPress={() => s.dispatch({ type: "remove_other", text: t })} />
            ))}
          </View>
        </View>
      ) : null}

      <View>
        {secs.map((sec) => {
          const isOpen = open.has(sec.family);
          const count = sec.groups.filter((g) => s.have.includes(g.id)).length;
          const Chevron = isOpen ? ChevronDown : ChevronRight;
          return (
            <View key={sec.family} style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => toggleFamily(sec.family)}
                style={styles.sectionHead}
              >
                <T variant="caption" tone="muted" style={styles.grow}>
                  {sec.label}
                </T>
                {count ? (
                  <Num variant="num-sm" tone="muted">
                    {count}
                  </Num>
                ) : null}
                <Chevron size={size.icon} strokeWidth={size.iconStroke} color={color.muted} />
              </Pressable>
              {isOpen ? (
                <View style={[styles.wrap, styles.sectionBody]}>
                  {sec.groups.map((g) => (
                    <Chip key={g.id} label={g.label} selected={s.have.includes(g.id)} onPress={() => s.dispatch({ type: "toggle_have", group: g.id })} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

    </Screen>
  );
}

/** Adds the search text as a free-text item. */
function AddChip({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.add, pressed && { backgroundColor: color["surface-soft"] }]}>
      <Plus size={size.icon} strokeWidth={size.iconStroke} color={color.ink} />
      <T variant="label">Add “{text}”</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: space["space-2"] },
  iconBtn: { width: size.touch, height: size.touch, alignItems: "center", justifyContent: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
  headRow: { flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  section: { borderBottomWidth: size.border, borderBottomColor: color.hairline },
  sectionHead: { minHeight: size.touch, flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  sectionBody: { paddingBottom: space["space-3"] },
  grow: { flex: 1 },
  center: { textAlign: "center" },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: space["space-3"] },
  money: { flex: 1, flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  add: {
    minHeight: size.chip,
    flexDirection: "row",
    alignItems: "center",
    gap: space["space-1"],
    paddingHorizontal: space["space-3"],
    borderRadius: radius["radius-md"],
    borderWidth: size.border,
    borderStyle: "dashed",
    borderColor: color["border-strong"],
    backgroundColor: color.surface,
  },
});
