import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { reduce, START, type Action, type Answers } from "./answers";

const Ctx = createContext<{ answers: Answers; dispatch: Dispatch<Action> } | null>(null);

/** Answers live here until the last screen saves them as the profile. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [answers, dispatch] = useReducer(reduce, START);
  return <Ctx.Provider value={{ answers, dispatch }}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding outside OnboardingProvider");
  return ctx;
}
