#!/bin/zsh
# The weekly price run (CLAUDE.md step 7), run by launchd every Sunday at 02:00
# It works in its own git worktree on the `prices` branch, so it never touches
# the working copy you edit:
#   1. reset the worktree to the branch your working copy is on (or
#      PANTRY_PRICES_BASE), install,
#   2. npm run prices:weekly (StatCan, provinces, manual CSV, the store collector),
#   3. run every test, and stop if any fail,
#   4. commit the new price table on `prices`,
#   5. deploy staging, so the new prices are live there.
# It never pushes, never touches your branch, and never deploys production.
# Merge `prices` into your branch yourself after a look.
# Run it yourself: tools/prices/weekly-job.sh (a Sunday reminder,
# com.pantry.prices-reminder, says when). Log: ~/Library/Logs/pantry-prices.log
set -euo pipefail
# The npm the project needs (devEngines: 11.6.1 or later) is the user-global one first.
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="${PANTRY_REPO:-$HOME/Desktop/James/Pantry-AI}"
WT="${PANTRY_PRICES_WORKTREE:-$HOME/Desktop/James/Pantry-AI-prices}"
notify() { osascript -e "display notification \"$1\" with title \"Pantry prices\"" >/dev/null 2>&1 || true; }
trap 'notify "Weekly price run failed. See ~/Library/Logs/pantry-prices.log"' ERR

echo "=== $(date '+%Y-%m-%d %H:%M') weekly price run"
cd "$REPO"
BASE="${PANTRY_PRICES_BASE:-$(git branch --show-current)}"
echo "Base: $BASE"
if [ ! -d "$WT" ]; then git worktree add -f "$WT" -B prices "$BASE"; fi
cd "$WT"
git checkout -q prices
git reset -q --hard "$BASE"
# The Project Hammer download is kept between runs (a day) in the main copy's cache.
mkdir -p tools/prices/.cache "$REPO/tools/prices/.cache"
[ -e tools/prices/.cache/hammer.zip ] || ln -sf "$REPO/tools/prices/.cache/hammer.zip" tools/prices/.cache/hammer.zip 2>/dev/null || true

npm ci --no-audit --no-fund --loglevel=error
# Project Hammer joins once its maintainer agrees: set PRICE_SOURCES to include `hammer` here.
npm run prices:weekly
npm test --workspaces --if-present

if git diff --quiet -- packages/vocabulary/data/price-table.json tools/prices/manual-prices.csv; then
  echo "No price changes."
  notify "Weekly prices: no changes."
  exit 0
fi
git add packages/vocabulary/data/price-table.json tools/prices/manual-prices.csv
git commit -q -m "Weekly prices $(date +%Y-%m-%d)"
npm run deploy:staging -w @pantry/backend
echo "Committed on 'prices' and deployed to staging."
notify "Weekly prices committed on the prices branch and live on staging. Merge it when happy."
