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

export type Units = "metric" | "imperial";

/**
 * What's typed, as typed. Metric uses `height_cm` / `weight_kg` /
 * `target_kg`; imperial uses feet and inches and pounds. Whatever the form
 * shows, stats are stored metric.
 */
export interface StatsForm {
  units: Units;
  height_cm: string;
  height_ft: string;
  height_in: string;
  weight_kg: string;
  weight_lb: string;
  age: string;
  sex: (typeof SEXES)[number]["value"] | null;
  activity: Activity | null;
  /** Optional, in the form's units. */
  target_kg: string;
  target_lb: string;
}

export const EMPTY_FORM: StatsForm = {
  units: "metric",
  height_cm: "",
  height_ft: "",
  height_in: "",
  weight_kg: "",
  weight_lb: "",
  age: "",
  sex: null,
  activity: null,
  target_kg: "",
  target_lb: "",
};

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

/** Plausible adult ranges, in metric; outside them the number is almost certainly a typo. */
const RANGE = { height_cm: [100, 250], weight_kg: [30, 300], age: [16, 110] } as const;

function num(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(round1(n));

/** 6′0″ style, for range messages. */
export function feetInches(cm: number): string {
  const inches = Math.round(cm / CM_PER_IN);
  return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
}

const kgToLb = (kg: number) => kg / KG_PER_LB;

/** Switches the form's units, converting whatever has been typed so nothing is lost. */
export function switchUnits(f: StatsForm, to: Units): StatsForm {
  if (f.units === to) return f;
  if (to === "imperial") {
    const cm = num(f.height_cm);
    const inches = cm === null ? null : Math.round(cm / CM_PER_IN);
    const lb = (kg: string) => (num(kg) === null ? "" : String(Math.round(kgToLb(num(kg)!))));
    return {
      ...f,
      units: to,
      height_ft: inches === null ? "" : String(Math.floor(inches / 12)),
      height_in: inches === null ? "" : String(inches % 12),
      weight_lb: lb(f.weight_kg),
      target_lb: lb(f.target_kg),
    };
  }
  const ft = num(f.height_ft);
  const inch = num(f.height_in || "0");
  const kg = (lb: string) => (num(lb) === null ? "" : fmt(num(lb)! * KG_PER_LB));
  return {
    ...f,
    units: to,
    height_cm: ft === null || inch === null ? "" : String(Math.round((ft * 12 + inch) * CM_PER_IN)),
    weight_kg: kg(f.weight_lb),
    target_kg: kg(f.target_lb),
  };
}

/**
 * The form as metric body stats, or the first thing to fix, worded as one
 * short line for under the Save button, in the units on screen. Only target
 * weight may be blank.
 */
export function readStats(f: StatsForm): { ok: true; stats: BodyStats } | { ok: false; fix: string } {
  const imperial = f.units === "imperial";
  const [hMin, hMax] = RANGE.height_cm;
  const [wMin, wMax] = RANGE.weight_kg;
  const heightRange = imperial ? `${feetInches(hMin)} and ${feetInches(hMax)}` : `${hMin} and ${hMax} cm`;
  const weightRange = imperial ? `${Math.ceil(kgToLb(wMin))} and ${Math.floor(kgToLb(wMax))} lb` : `${wMin} and ${wMax} kg`;

  let h: number | null;
  if (imperial) {
    const ft = num(f.height_ft);
    const inch = f.height_in.trim() ? num(f.height_in) : 0;
    if (ft === null) return { ok: false, fix: "Enter your height in feet and inches" };
    if (inch === null || inch >= 12) return { ok: false, fix: "Inches should be 0 to 11" };
    h = (ft * 12 + inch) * CM_PER_IN;
  } else {
    h = num(f.height_cm);
    if (h === null) return { ok: false, fix: "Enter your height in cm" };
  }
  if (h < hMin || h > hMax) return { ok: false, fix: `Height should be between ${heightRange}` };

  const toKg = (t: string) => (imperial ? (num(t) === null ? null : num(t)! * KG_PER_LB) : num(t));
  const w = toKg(imperial ? f.weight_lb : f.weight_kg);
  if (w === null) return { ok: false, fix: `Enter your weight in ${imperial ? "lb" : "kg"}` };
  if (w < wMin || w > wMax) return { ok: false, fix: `Weight should be between ${weightRange}` };

  const a = num(f.age);
  if (a === null || !Number.isInteger(a)) return { ok: false, fix: "Enter your age in whole years" };
  if (a < RANGE.age[0] || a > RANGE.age[1]) return { ok: false, fix: `Age should be between ${RANGE.age[0]} and ${RANGE.age[1]}` };
  if (f.sex === null) return { ok: false, fix: "Choose an answer for sex" };
  if (f.activity === null) return { ok: false, fix: "Choose how active you are" };

  let target: number | null = null;
  const targetText = imperial ? f.target_lb : f.target_kg;
  if (targetText.trim()) {
    target = toKg(targetText);
    if (target === null) return { ok: false, fix: "Target weight should be a number, or left blank" };
    if (target < wMin || target > wMax) return { ok: false, fix: `Target weight should be between ${weightRange}, or left blank` };
  }
  return {
    ok: true,
    stats: BodyStats.parse({
      height_cm: round1(h),
      weight_kg: round1(w),
      age: a,
      sex: f.sex === "skip" ? null : f.sex,
      activity: f.activity,
      target_kg: target === null ? null : round1(target),
    }),
  };
}
