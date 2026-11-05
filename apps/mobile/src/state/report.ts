import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL, apiFetch } from "@/data/api";
import { httpReportSource } from "@/data/http";
import type { ReportSource } from "@/data/sources";
import { mockReportSource } from "@/mock/report";
import { deviceId } from "./device";

const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";

/** Where Settings › Report a problem sends to: the API when set, otherwise the offline mock. */
export const reportSource: ReportSource = API_URL
  ? httpReportSource(API_URL, deviceId, { version: Constants.expoConfig?.version ?? "unknown", platform }, apiFetch)
  : mockReportSource();
