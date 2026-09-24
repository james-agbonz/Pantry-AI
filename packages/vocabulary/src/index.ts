import groupsData from "../data/groups.json";
import tableData from "../data/price-table.json";
import { loadVocabulary } from "./vocabulary";

export * from "./schema";
export * from "./vocabulary";

/** The price table bundled with the app and the server: the fallback when no fresher one has been fetched. */
export const bundledPriceTable: unknown = tableData;

/** The shipped vocabulary. Checked on load: bad data fails loudly, not silently. */
export const vocabulary = loadVocabulary({ ...groupsData, table: tableData });
