import type { Profile } from "@pantry/contract";
import { BodyStats, type Activity, type Sex } from "@pantry/needs";

/**
 * Body stats are asked once, after the first meal is picked, and only for
 * cut, bulk or condition. For those goals they're required (SPEC §3).
 */
export function needsBodyStats(p: Profile): boolean {
  return p.goal !== "eat_well" && p.targets === null;
}

export const SEXES: { value: Exclude<Sex, null> | "skip"; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Another answer" },
  { value: "skip", label: "Prefer not to say" },
];

export const ACTIVITIES: { value: Activity; label: string; hint: string }[] = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk work, little walking" },
  { value: "light", label: "Light", hint: "On your feet some of the day" },
  { value: "moderate", label: "Moderate", hint: "On your feet most of the day, or exercise 3–5 days a week" },
  { value: "very_active", label: "Very active", hint: "Physical work, or hard exercise most days" },
];

export interface StatsForm {
  height_cm: string;
  weight_kg: string;
  age: string;
  sex: (typeof SEXES)[number]["value"] | null;
  activity: Activity | null;
  /** Optional. */
  target_kg: string;
}

export const EMPTY_FORM: StatsForm = { height_cm: "", weight_kg: "", age: "", sex: null, activity: null, target_kg: "" };

/** Plausible adult ranges; outside them the number is almost certainly a typo. */
const RANGE = { height_cm: [100, 250], weight_kg: [30, 300], age: [16, 110] } as const;

function num(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * The form as body stats, or the first thing to fix, worded as one short line
 * for under the Save button. Only target weight may be blank.
 */
export function readStats(f: StatsForm): { ok: true; stats: BodyStats } | { ok: false; fix: string } {
  const h = num(f.height_cm);
  if (h === null || h < RANGE.height_cm[0] || h > RANGE.height_cm[1]) return { ok: false, fix: "Enter your height in cm" };
  const w = num(f.weight_kg);
  if (w === null || w < RANGE.weight_kg[0] || w > RANGE.weight_kg[1]) return { ok: false, fix: "Enter your weight in kg" };
  const a = num(f.age);
  if (a === null || !Number.isInteger(a) || a < RANGE.age[0] || a > RANGE.age[1]) return { ok: false, fix: "Enter your age" };
  if (f.sex === null) return { ok: false, fix: "Choose an answer for sex" };
  if (f.activity === null) return { ok: false, fix: "Choose how active you are" };
  let target: number | null = null;
  if (f.target_kg.trim()) {
    target = num(f.target_kg);
    if (target === null || target < RANGE.weight_kg[0] || target > RANGE.weight_kg[1]) return { ok: false, fix: "Check your target weight, or leave it blank" };
  }
  return {
    ok: true,
    stats: BodyStats.parse({ height_cm: h, weight_kg: w, age: a, sex: f.sex === "skip" ? null : f.sex, activity: f.activity, target_kg: target }),
  };
}
