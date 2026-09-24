import AsyncStorage from "@react-native-async-storage/async-storage";
import { Profile } from "@pantry/contract";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "pantry.profile.v1";

interface ProfileState {
  /** `undefined` while loading; `null` when onboarding hasn't been done. */
  profile: Profile | null | undefined;
  save: (p: Profile) => Promise<void>;
  clear: () => Promise<void>;
}

const Ctx = createContext<ProfileState | null>(null);

/** Onboarding happens once (SPEC §2): the profile is kept on the device. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        // A stored profile that no longer matches the contract means onboarding again.
        const parsed = raw ? Profile.safeParse(JSON.parse(raw)) : null;
        setProfile(parsed?.success ? parsed.data : null);
      })
      .catch(() => setProfile(null));
  }, []);

  const save = useCallback(async (p: Profile) => {
    const valid = Profile.parse(p);
    await AsyncStorage.setItem(KEY, JSON.stringify(valid));
    setProfile(valid);
  }, []);

  const clear = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({ profile, save, clear }), [profile, save, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfile outside ProfileProvider");
  return ctx;
}
