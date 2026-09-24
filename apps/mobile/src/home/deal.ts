/**
 * Why "Deal me meals" is disabled, as one muted line, or `null` when it's
 * ready. Checked in the order the user can act on them.
 */
export function dealBlocker(s: { decksLeft: number | undefined; picked: number; budget: number | null }): string | null {
  if (s.decksLeft === 0) return "That's today's decks. More tomorrow.";
  if (s.picked === 0) return "Tap at least one thing you have";
  if (s.budget === null) return "Enter a budget";
  return null;
}
