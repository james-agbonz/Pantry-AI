import { fetch as expoFetch } from "expo/fetch";
import type { Fetch } from "./http";

/**
 * The backend's address, from EXPO_PUBLIC_API_URL at build time (e.g. the
 * dev server on http://localhost:8787, or the deployed Worker). Unset: the
 * app runs on mocks, offline.
 */
export const API_URL: string | undefined = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || undefined;

/** `expo/fetch`: streams response bodies on the phone, which the deck's stages need. */
export const apiFetch = expoFetch as unknown as Fetch;
