# Pantry — design

Tokens live in `design/tokens.json`. Use token names, never raw values. The same system is published as a browsable design system on Claude; this file is the repo copy.

Built on the structure of the Binance DESIGN.md — one accent, a separate face for numbers, flat colour blocks, colours that mean direction — with Binance's yellow, dark canvas and proprietary fonts replaced. It is a money screen with food on it.

## Content

The reader is tired, hungry and counting.

- **Money first, plainly.** "~$13.49 of $15", not "Great value!"
- **Every estimate carries `~`.** Say once per money screen that prices are typical, not quotes.
- **No judgment.** Never "only", "cheap" or "you failed". Over budget is a fact: "Over by ~$3".
- **Short.** A badge is three words. A method step is one sentence.
- **Sentence case** everywhere, buttons included.

| Say | Don't say |
|---|---|
| +~$2 to complete | Missing items! |
| Over by ~$3 | Budget exceeded |
| Deal me meals | Generate recipes |
| Copy shopping list | Export |

## Colour

- Screens sit on `canvas`; cards, sheets and inputs are `surface`. That step is the main separation. `hairline` divides inside cards.
- `primary` (#404010) is the only accent: the one primary action per screen, the keep swipe, selected chips, focus. Two olive things on one screen means one is wrong. Never body text, never a large fill.
- `fits`, `complete`, `over` are money status only — text, icons and their `-soft` badge fills. Never a card or screen fill, never reused for general errors. Their lightness is close, so a badge always carries a word and an icon.
- Light theme only for now.

## Type

- Inter for words; IBM Plex Sans for every number — prices, calories, protein. Both from Google Fonts.
- Styles: `display` · `title` · `title-sm` · `body` · `body-sm` · `caption` · `label` · `num-lg` · `num` · `num-sm`.

## Shape and space

- `radius-sm` buttons · `radius-md` inputs and chips · `radius-lg` cards and photos · `radius-pill` badges and round swipe buttons.
- 4px grid; `space-4` screen gutters.
- Flat everywhere. The only shadow, `shadow-lift`, belongs to the top card of the deck because it can be dragged.

## Imagery and icons

- Photos are the only imagery: home cooking, normal plate, realistic portion, kitchen light. `surface-soft` while loading.
- One exception: the kitchen illustration on the appliances screen of onboarding, where you tap to highlight what you have (SPEC §3). Until it's drawn, that screen uses tiles with outline icons. It must be in place before launch.
- Outline icons, 1.5px stroke, 20px in running UI, 24px on swipe buttons. No emoji in the interface.
- Icons are lucide. Where lucide has nothing fitting, draw one on its 24px grid with round caps and joins (the oven). Never borrow a food icon for a non-food thing: a croissant for "oven" sitting next to ingredient chips reads as food.
- No logo yet: the word "Pantry" in `display`.

## Components

- **Button** — primary (`primary` fill, `on-primary` label, 44px), secondary (`surface`, `border-strong` edge), text (no fill or edge). A text button's label is `ink` whenever a primary button is on the same screen, so the primary stays the only olive thing; it's `primary` only when it's the screen's only action. Pressed `primary-active`; disabled `primary-soft` with `muted`.
- **BudgetBadge** — fits / to complete / over; pill, 28px, word + icon + `num-sm` figure.
- **IngredientChip** — unselected `surface` + `border-strong`; selected `primary-soft` + `primary` edge and label + check. 40px, grouped under a `caption` family label.
- **MealCard** — photo 4:3 first, name in `title`, meta row (time, ~kcal, ~protein) in `num-sm`, one BudgetBadge. Below: round pass, rewind (always visible), round keep. Buttons mirror the swipes.

## Accessibility

- All text 4.5:1 or better on its ground; control edges and focus 3:1 or better. Checked for every token pair.
- Touch targets at least 44px. Every swipe has a button equivalent.
