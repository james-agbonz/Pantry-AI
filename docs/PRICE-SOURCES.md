# Where real prices could come from

A decision paper, 2026-11-05. Today the app prices from StatCan's national monthly averages plus a hand-filled CSV for one Toronto store (CLAUDE.md step 7). The question is how to get closer to real, local prices, and whether that needs a location and a weekly price collector. Nothing here is decided. The choices are at the end.

## The major grocers

The top five hold about three-quarters of grocery sales ([The Packer](https://www.thepacker.com/news/retail/five-retailers-dominate-canadas-grocery-sales), from USDA/Euromonitor 2025 figures; [Grocery Trade News](https://www.grocerytradenews.com/top-grocery-stores-in-canada-2025/)).

| Group | Share (2025) | Discount banners first, as most relevant to our users |
|---|---|---|
| **Loblaw** | ~17% | No Frills, Real Canadian Superstore, Maxi, Wholesale Club, Loblaws, Zehrs, Fortinos, Provigo, Independent, T&T (owned), Shoppers Drug Mart |
| **Costco** | ~15% | Costco (membership; bulk sizes) |
| **Empire (Sobeys)** | ~14% | FreshCo, Foodland, Sobeys, Safeway, IGA, Thrifty Foods, Farm Boy, Longo's, Voilà (online) |
| **Walmart** | ~13% | Walmart Supercentre |
| **Metro** | ~6% | Food Basics, Super C, Metro |
| Others | | Save-On-Foods (BC, AB, SK, MB), Co-op (West), Giant Tiger, Dollarama (some food), Galleria, independent and ethnic grocers |

## Can we scrape them weekly? Not within our own rules

- **Loblaw** (No Frills, Superstore, Loblaws and the rest, through PC Express) bans "any software, data mining tools, bots, automated tools … to scrape, navigate, search or collect any information" from its sites and app ([Loblaw terms of use](https://www.realcanadiansuperstore.ca/en/termsofuse)).
- **Walmart Canada** bans "spiders, robots … or other devices" to "scrape, navigate or search the site", other than ordinary browsers ([Walmart.ca terms of use](https://www.walmart.ca/en/help/article/terms-of-use/e4f09ed615244a33b8493381499a07e1)).
- **Sobeys/Voilà, Metro, Costco and Save-On-Foods:** not checked one by one yet, but big-retailer terms almost always say the same.
- **Flipp** (the flyer app) has no public developer API. The "Flipp APIs" for sale on scraping marketplaces are scrapers of Flipp, with the same problem.
- **Our own rule** (BACKLOG › Later) is to check each store's terms, prefer official APIs, feeds or licensed data, and never get around bot detection. A weekly scraper of these sites would break the first two, and in practice the third: these sites block cloud IPs, Cloudflare Workers among them.
- **The risk** is mostly civil, not criminal: blocked IPs, cease-and-desist letters, and for an app about trust, reputation. It's also fragile, because any site redesign breaks it.

## What we can use

| Source | What it gives | Location | Licence and terms | Fit |
|---|---|---|---|---|
| **StatCan 18-10-0245** (in use) | Monthly average prices for common foods, from retailers' transaction data | **Canada, each province, Whitehorse, Yellowknife** ([table](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024502)) | Open Government Licence | **Strong.** We use only the Canada row today. The province rows give regional prices with no scraping |
| **Hand-filled reference store** (in use) | Exact shelf prices, item by item, entered by a person | One store (No Frills, Toronto) | A person reading a public page; no bot | Good for accuracy, slow to maintain. One per region at most |
| **Project Hammer** | Daily scraped prices from 8 vendors (Voilà, T&T, Loblaws, No Frills, Metro, Galleria, Walmart, Save-On-Foods), since Feb 2024 | One Toronto neighbourhood, in-store pickup ([project](https://jacobfilipp.com/hammer/)) | No formal licence. The maintainer reportedly allows redistribution with credit: "The underlying data was sourced from ProjectHammer.org" ([via](https://github.com/MhBaigtw/DE-Grocery-Price-tool)) | **For checking only:** test our estimates against it. It's scraped data, so building the product on it moves the terms problem rather than solving it. Confirm it's still updated |
| **Open Prices** (Open Food Facts) | Crowdsourced shelf prices by barcode, with an API ([about](https://prices.openfoodfacts.org/about)) | Wherever people submit; North America thinner than Europe | ODbL: free use with credit; changes to the data stay open | **Later:** a way for users to add prices from their own receipts, shared openly |
| **Instacart Developer Platform** | Free API, US and Canada: nearby retailers by postal code, and shoppable lists or recipes on Instacart ([docs](https://docs.instacart.com/developer_platform_api)) | Postal code | Developer terms; whether it returns prices to us is unclear | **Maybe:** a "buy this list on Instacart" button. Instacart prices run above shelf prices, though, and the users are people on very little |
| **Retailer partnership or licensed data** | Flyer and shelf prices under contract (a grocer's data team, or a licensed flyer-data provider) | Store level | Paid, negotiated | **Best data, but it takes time and money.** Worth asking once the app has users to show |
| **Koupon King data** | Weekly deal snapshots and a price series ([repo](https://github.com/ryanbakerhere/koupon-king-data)) | Some chains | ODbL, but collected by private scrapers | Same issue as Project Hammer |

## Location

- **Province level gets most of the gain with almost no privacy cost.** StatCan already has province rows, so the app needs only the province: a one-time picker in onboarding, or the first letter of the postal code. Prices differ more between provinces (the North, the Atlantic, BC) than within a city.
- **GPS or full postal codes** only pay off with store-level prices, which we can't legally get yet (see above). They'd also add a sensitive field to collect, store and explain.
- This changes SPEC §15, which lists "regional price differences" as out of scope for v1. Your call.

## Recommendation

1. **No weekly scraper.**
2. **Province pricing from StatCan:** import every province row, not just Canada, and add a province choice to onboarding and Settings. It's a data and pricing change; the monthly import (`npm run prices:import`) already reads the table.
3. **Keep the hand-filled reference store** for the staples StatCan doesn't cover, and finish rows 1–83.
4. **Use Project Hammer to check our estimates,** not as a source. Check Toronto prices against it once, to see how far off StatCan averages are.
5. **Later:**
   - Let users add prices they see (Open Prices).
   - Ask grocers for data once there are users.
   - Look at an Instacart "buy this list" link.

## Decisions for you

- [ ] **Regional prices in v1?** Yes means a SPEC change. Province only, or finer?
- [ ] **How the app learns the province:** a picker, or the first letter of the postal code?
- [ ] **Project Hammer:** use it to check our numbers? Contact the maintainer first?
- [ ] **Instacart link:** worth exploring?

## For the privacy policy and terms (also in BACKLOG)

- **Prices are estimates.** They come from Statistics Canada averages and a reference store, dated, and aren't quotes from any store. The app already shows `~` and "typical" or "sample", and the policy should say the same.
- **AI use:**
  - Meals are suggested by an AI model (which one, and its provider, from config).
  - Photos are AI-generated illustrations, not pictures of the actual meal.
  - What's sent to the model: the profile limits, appliances, goal and targets, plus the session's food and budget. Never a name.
  - Whether the provider keeps or trains on it depends on the provider's terms. Free tiers may.
- **Location:** if the province is added, say it's used only to pick regional prices, kept on the phone, and sent with each deck request.
