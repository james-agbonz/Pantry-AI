/** Today's logged meals (SPEC §13). Free logging comes from the selected meal. */
export interface LoggedMeal {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
}

export interface DayLog {
  day: string;
  meals: LoggedMeal[];
}

/** Adds a meal to today, starting a fresh day when the date has moved on. The same card twice counts once. */
export function logMeal(log: DayLog | null, meal: LoggedMeal, today: string): DayLog {
  const meals = log && log.day === today ? log.meals : [];
  return { day: today, meals: meals.some((m) => m.id === meal.id) ? meals : [...meals, meal] };
}

export function todayTotals(log: DayLog | null, today: string): { kcal: number; protein_g: number; meals: number } {
  const meals = log && log.day === today ? log.meals : [];
  return {
    kcal: meals.reduce((s, m) => s + m.kcal, 0),
    protein_g: meals.reduce((s, m) => s + m.protein_g, 0),
    meals: meals.length,
  };
}
