import { useCallback, useEffect, useState } from "react";

export type AuthUser = {
  email: string;
  name: string;
  picture: string;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return null;
        const text = await r.text();
        if (!text) return null;
        try {
          return JSON.parse(text) as { user?: AuthUser };
        } catch {
          return null;
        }
      })
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
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

  return { user, loading, signInWithGoogle, signOut };
}
