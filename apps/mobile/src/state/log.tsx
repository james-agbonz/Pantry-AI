import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dayKey } from "@/deck/state";
import { logMeal, todayTotals, type DayLog, type LoggedMeal } from "@/meal/log";

const KEY = "pantry.log.v1";

interface LogState {
  /** Adds a picked meal to today's totals (SPEC §13). */
  log: (meal: LoggedMeal) => Promise<void>;
  today: { kcal: number; protein_g: number; meals: number };
  /** Ids logged today, so the meal screen can say so. */
  loggedIds: ReadonlySet<string>;
}

const Ctx = createContext<LogState | null>(null);

/** Today's log, kept on the device. No streaks and nothing lost for gaps: a new day just starts at zero. */
export function LogProvider({ children }: { children: ReactNode }) {
  const [day, setDay] = useState<DayLog | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDay(JSON.parse(raw) as DayLog))
      .catch(() => {});
  }, []);

  const log = useCallback(
    async (meal: LoggedMeal) => {
      const next = logMeal(day, meal, dayKey(new Date()));
      setDay(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    },
    [day],
  );

  const value = useMemo<LogState>(() => {
    const today = dayKey(new Date());
    return {
      log,
      today: todayTotals(day, today),
      loggedIds: new Set(day && day.day === today ? day.meals.map((m) => m.id) : []),
    };
  }, [day, log]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLog(): LogState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLog outside LogProvider");
  return ctx;
}
