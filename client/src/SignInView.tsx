import { type FormEvent, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: {
            client_id: string;
            callback: (r: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, opts: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** GSI `initialize` must run once per page; React Strict Mode mounts twice otherwise. */
let gsiInitialized = false;

export function SignInView({
  bootError,
  showEmailPasswordForm,
  emailPasswordReady,
  googleEnabled,
  onCredential,
  onSignInEmail,
  onRegisterEmail,
}: {
  bootError: string | null;
  showEmailPasswordForm: boolean;
  emailPasswordReady: boolean;
  googleEnabled: boolean;
  onCredential: (c: string) => Promise<void>;
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onRegisterEmail: (email: string, password: string, name: string) => Promise<void>;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const handlerRef = useRef({ onCredential, setErr });
  handlerRef.current = { onCredential, setErr };

  useEffect(() => {
    if (!googleEnabled || !GOOGLE_CLIENT_ID) return;
    const tryRender = () => {
      if (!window.google || !btnRef.current) return;
      if (!gsiInitialized) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              await handlerRef.current.onCredential(credential);
            } catch (e) {
              handlerRef.current.setErr(
                e instanceof Error ? e.message : "Sign-in failed."
              );
            }
          },
        });
        gsiInitialized = true;
      }
      btnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "signin_with",
      });
    };
    if (window.google) {
      tryRender();
    } else {
      const id = setInterval(() => {
        if (window.google) {
          clearInterval(id);
          tryRender();
        }
      }, 100);
      return () => clearInterval(id);
    }
  }, [googleEnabled, onCredential]);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailPasswordReady) return;
    setErr(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await onRegisterEmail(email, password, displayName);
      } else {
        await onSignInEmail(email, password);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const noMethods = !showEmailPasswordForm && !googleEnabled;

  const emailDisabled = busy || !emailPasswordReady;

  return (
    <div className="signin-view">
      <h1>Boltline RAG</h1>
      <p className="signin-subtitle">Sign in to continue</p>
      {bootError ? (
        <p className="signin-error">
          <strong>API:</strong> {bootError}
        </p>
      ) : null}
      {noMethods && !bootError ? (
        <p className="signin-error">
          No sign-in method is available. For Google, set <code>GOOGLE_CLIENT_ID</code> on the server
          and <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code>. Sessions need{" "}
          <code>SESSION_SECRET</code>.
        </p>
      ) : null}

      {showEmailPasswordForm ? (
        <form className="signin-form" onSubmit={submitEmail}>
          {!emailPasswordReady ? (
            <p className="signin-hint">
              Email/password sign-in on production needs <code>REDIS_URL</code> (e.g. Upstash) in
              Vercel → Environment Variables, then redeploy. Google sign-in works without it.
            </p>
          ) : null}
          {mode === "register" ? (
            <label className="signin-field">
              <span>Name (optional)</span>
              <input
                type="text"
                className="signin-input"
                autoComplete="name"
                value={displayName}
                onChange={(ev) => setDisplayName(ev.target.value)}
                disabled={emailDisabled}
                placeholder="Your name"
              />
            </label>
          ) : null}
          <label className="signin-field">
            <span>Email</span>
            <input
              type="email"
              className="signin-input"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={emailDisabled}
              required
            />
          </label>
          <label className="signin-field">
            <span>Password</span>
            <input
              type="password"
              className="signin-input"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              disabled={emailDisabled}
              minLength={8}
              required
            />
          </label>
          <button type="submit" className="btn primary signin-submit" disabled={emailDisabled}>
            {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
          </button>
          <p className="signin-toggle">
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode(mode === "signin" ? "register" : "signin");
                setErr(null);
              }}
              disabled={emailDisabled}
            >
              {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
            </button>
          </p>
        </form>
      ) : null}

      {showEmailPasswordForm && googleEnabled ? (
        <div className="signin-divider" role="separator">
          <span>or</span>
        </div>
      ) : null}

      {googleEnabled && GOOGLE_CLIENT_ID ? <div ref={btnRef} className="google-btn-wrap" /> : null}

      {err ? <p className="signin-error">{err}</p> : null}
    </div>
  );
}
