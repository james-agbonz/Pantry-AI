import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Inputs";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { ReportError } from "@/data/sources";
import { reportSource } from "@/state/report";
import { space, type } from "@/theme";

const MAX = 2000;

const FAILED: Record<ReportError["reason"], string> = {
  network: "Couldn't send. Check your connection and try again.",
  rate_limit: "That's a few reports in a row. Wait a minute, then try again.",
  server: "Couldn't send right now. Try again in a little while.",
};

/** Settings › Report a problem: one message, sent with the app version and phone type. */
export default function Report() {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      await reportSource.send(message.trim());
      setState("sent");
    } catch (e) {
      setError(FAILED[e instanceof ReportError ? e.reason : "server"]);
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <Screen title="Thanks for telling us" back footer={<Button label="Done" onPress={() => router.back()} />}>
        <T variant="body">Your report is sent. We read every one.</T>
      </Screen>
    );
  }

  return (
    <Screen
      title="Report a problem"
      back
      footer={
        <>
          {error ? (
            <T variant="body-sm" accessibilityLiveRegion="polite" style={styles.center}>
              {error}
            </T>
          ) : null}
          <Button label={state === "sending" ? "Sending…" : "Send report"} disabled={!message.trim() || state === "sending"} onPress={send} />
        </>
      }
    >
      <T variant="body" tone="muted">
        What went wrong? A wrong price, a meal that breaks your limits, something that didn't work: tell us in your own words.
      </T>
      <TextField
        value={message}
        onChangeText={(t) => setMessage(t.slice(0, MAX))}
        placeholder="What happened?"
        accessibilityLabel="What happened"
        multiline
        textAlignVertical="top"
        style={styles.box}
      />
      <T variant="body-sm" tone="muted">
        We get your message, the app version and your phone type. Not your name, email or anything you've told the app about yourself.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: type.body.lineHeight * 6, paddingTop: space["space-3"], paddingBottom: space["space-3"] },
  center: { textAlign: "center" },
});
