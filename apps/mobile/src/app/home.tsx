import { vocabulary } from "@pantry/vocabulary";
import { router } from "expo-router";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Choice";
import { TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { Num, T } from "@/components/Text";
import { decksLeftText } from "@/deck/state";
import { OPEN_BY_DEFAULT, search, sections } from "@/home/groups";
import { useSession } from "@/state/session";
import { color, radius, size, space } from "@/theme";

const SECTIONS = sections(vocabulary);
const LABEL = new Map(vocabulary.groups.map((g) => [g.id, g.label]));

/**
 * Home (SPEC §4): tap what you have, enter a budget, deal. Search on top;
 * families as collapsible sections with the everyday ones open.
 */
export default function Home() {
  const s = useSession();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(OPEN_BY_DEFAULT));
  const results = useMemo(() => search(vocabulary, query), [query]);

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

  const noneLeft = s.decksLeft === 0;
  const picked = s.have.length + s.have_other.length;

  return (
    <Screen
      title="What's in the fridge?"
      footer={
        <>
          {s.decksLeft !== undefined ? (
            <T variant="body-sm" tone="muted" style={styles.center}>
              {noneLeft ? "That's today's decks. More tomorrow." : decksLeftText(s.decksLeft)}
            </T>
          ) : null}
          <Button label="Deal me meals" disabled={s.budget === null || noneLeft} onPress={() => router.push("/loading")} />
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
        {SECTIONS.map((sec) => {
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

      <View style={styles.block}>
        <T variant="title-sm">Budget</T>
        <View style={styles.budgetRow}>
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
        </View>
        <T variant="body-sm" tone="muted">
          CAD, for this shop.
        </T>
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
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["space-2"] },
  headRow: { flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  section: { borderBottomWidth: size.border, borderBottomColor: color.hairline },
  sectionHead: { minHeight: size.touch, flexDirection: "row", alignItems: "center", gap: space["space-2"] },
  sectionBody: { paddingBottom: space["space-3"] },
  grow: { flex: 1 },
  center: { textAlign: "center" },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: space["space-2"] },
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
