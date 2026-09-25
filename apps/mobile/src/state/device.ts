import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";

const KEY = "pantry.device.v1";
let cached: Promise<string> | null = null;

/**
 * An anonymous ID for this install, made on first launch: random, no personal
 * data. The server keys the three-a-day limit to it (SPEC §16).
 */
export function deviceId(): Promise<string> {
  cached ??= (async () => {
    const saved = await AsyncStorage.getItem(KEY).catch(() => null);
    if (saved) return saved;
    const id = randomUUID();
    await AsyncStorage.setItem(KEY, id).catch(() => {});
    return id;
  })();
  return cached;
}
