import { useCallback, useEffect, useState } from "react";

export type AuthUser = {
  email: string;
  name: string;
  picture: string;
};

type HealthJson = {
  ok?: boolean;
  sessionConfigured?: boolean;
  emailPasswordAuth?: boolean;
  googleAuth?: boolean;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  /** Server will accept /api/auth/login and register (Redis in production, or dev in-memory). */
  const [emailPasswordReady, setEmailPasswordReady] = useState(false);
  /** Show email/password fields whenever SESSION_SECRET is configured (even if Redis still missing). */
  const [showEmailPasswordForm, setShowEmailPasswordForm] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

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
        let healthJson: HealthJson = {};
        try {
          healthJson = (await health.json()) as HealthJson;
        } catch {
          /* ignore */
        }
        if (healthJson.sessionConfigured === false) {
          setShowEmailPasswordForm(false);
          setBootError(
            "SESSION_SECRET is not set on the server. In Vercel: Project → Settings → Environment Variables → add SESSION_SECRET (run openssl rand -hex 32), save, then Redeploy."
          );
          return;
        }
        setShowEmailPasswordForm(true);
        const viteGoogle = Boolean(
          (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()
        );
        setEmailPasswordReady(healthJson.emailPasswordAuth === true);
        setGoogleEnabled(healthJson.googleAuth === true && viteGoogle);

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

  const signInWithEmailPassword = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const text = await res.text();
    let data: { error?: string; user?: AuthUser } = {};
    if (text) {
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error("Server returned invalid JSON.");
      }
    }
    if (!res.ok) throw new Error(data.error ?? "Sign-in failed.");
    if (!data.user) throw new Error("Sign-in succeeded but no user in response.");
    setUser(data.user);
  }, []);

  const registerWithEmailPassword = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const text = await res.text();
      let data: { error?: string; user?: AuthUser } = {};
      if (text) {
        try {
          data = JSON.parse(text) as typeof data;
        } catch {
          throw new Error("Server returned invalid JSON.");
        }
      }
      if (!res.ok) throw new Error(data.error ?? "Registration failed.");
      if (!data.user) throw new Error("Registration succeeded but no user in response.");
      setUser(data.user);
    },
    []
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return {
    user,
    loading,
    bootError,
    emailPasswordReady,
    showEmailPasswordForm,
    googleEnabled,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
    signOut,
  };
}
