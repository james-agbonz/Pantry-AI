import type { ReportSource } from "@/data/sources";

/**
 * Offline stand-in until EXPO_PUBLIC_API_URL is set: waits a moment and
 * keeps the report on the phone, so the screen can be tried without a server.
 * Reports sent this way reach nobody.
 */
export const mockReportSource = (): ReportSource & { sent: string[] } => {
  const sent: string[] = [];
  return {
    sent,
    async send(message) {
      await new Promise((r) => setTimeout(r, 300));
      sent.push(message);
    },
  };
};
