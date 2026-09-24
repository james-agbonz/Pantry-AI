import groupsData from "../data/groups.json";
import itemsData from "../data/items.json";
import { loadVocabulary } from "./vocabulary";

export * from "./schema";
export * from "./vocabulary";

/** The shipped vocabulary. Checked on load: bad data fails loudly, not silently. */
export const vocabulary = loadVocabulary({ ...groupsData, items: itemsData });
