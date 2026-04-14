import { useCallback, useEffect, useState } from "react";

export type AuthUser = {
  email: string;
  name: string;
  picture: string;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const health = await fetch("/api/health");
        if (!health.ok) {
          setBootError(
            `API returned ${health.status}. From the repo root run: npm run dev (starts API on 3001 and Vite on 5173). Avoid only dev:client. Check the terminal for crash logs.`
          );
          return;
        }
        const me = await fetch("/api/auth/me", { credentials: "include" });
        if (me.ok) {
          const text = await me.text();
          if (!text) {
            setUser(null);
            return;
          }
          try {
            const data = JSON.parse(text) as { user?: AuthUser };
            setUser(data.user ?? null);
          } catch {
            setUser(null);
          }
          return;
        }
        if (me.status === 401) {
          setUser(null);
          return;
        }
        const errText = await me.text();
        let msg = `Session check failed (${me.status}).`;
        if (errText) {
          try {
            const j = JSON.parse(errText) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            msg = errText.slice(0, 200);
          }
        }
        setBootError(msg);
      } catch {
        setBootError(
          "Cannot reach the API. From the project root run: npm run dev (needs port 3001 + 5173)."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signInWithGoogle = useCallback(async (credential: string) => {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const text = await res.text();
    let data: { error?: string; user?: AuthUser } = {};
    if (text) {
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error("Server returned invalid JSON. Is the API running on port 3001?");
      }
    }
    if (!res.ok) throw new Error(data.error ?? "Sign-in failed.");
    if (!data.user) throw new Error("Sign-in succeeded but no user in response.");
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return { user, loading, bootError, signInWithGoogle, signOut };
}
