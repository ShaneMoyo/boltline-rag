import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import HowItWorks from "./HowItWorks.tsx";
import { useAuth } from "./useAuth.ts";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

type Source = {
  sourcePath: string;
  chunkIndex: number;
  score: number;
  text: string;
};

type AskResponse = {
  answer: string;
  sources: Source[];
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** GSI `initialize` must run once per page; React Strict Mode mounts twice otherwise. */
let gsiInitialized = false;

function SignInView({
  bootError,
  onCredential,
}: {
  bootError: string | null;
  onCredential: (c: string) => Promise<void>;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const handlerRef = useRef({ onCredential, setErr });
  handlerRef.current = { onCredential, setErr };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
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
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="signin-view">
        <h1>Boltline RAG</h1>
        <p className="signin-error">
          <code>VITE_GOOGLE_CLIENT_ID</code> is not set. Add it to the <strong>repo root</strong>{" "}
          <code>.env</code> (same value as <code>GOOGLE_CLIENT_ID</code>) and restart{" "}
          <code>npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="signin-view">
      <h1>Boltline RAG</h1>
      <p className="signin-subtitle">Sign in to continue</p>
      {bootError ? (
        <p className="signin-error">
          <strong>API:</strong> {bootError}
        </p>
      ) : null}
      <div ref={btnRef} className="google-btn-wrap" />
      {err ? <p className="signin-error">{err}</p> : null}
    </div>
  );
}

export default function App() {
  const { user, loading, bootError, signInWithGoogle, signOut } = useAuth();
  const [tab, setTab] = useState<"ask" | "how">("ask");
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(5);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) { setError("Enter a question."); return; }
    setAsking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, topK }),
      });
      const data = (await res.json()) as { error?: string } & Partial<AskResponse>;
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (typeof data.answer !== "string" || !Array.isArray(data.sources))
        throw new Error("Unexpected response from server.");
      setResult({ answer: data.answer, sources: data.sources });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setAsking(false);
    }
  }, [question, topK]);

  if (loading) return <div className="splash">Loading…</div>;

  if (!user) return <SignInView bootError={bootError} onCredential={signInWithGoogle} />;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Boltline RAG</h1>
          <p className="subtitle">
            Ask anything about Stoke Space and Boltline — answers are grounded in retrieved snippets.
          </p>
        </div>
        <div className="header-right">
          {user.picture && (
            <img className="avatar" src={user.picture} alt={user.name} referrerPolicy="no-referrer" />
          )}
          <span className="user-name">{user.name}</span>
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="tab-row" role="tablist" aria-label="App view">
        <button
          type="button"
          role="tab"
          id="tab-ask"
          aria-selected={tab === "ask"}
          aria-controls="tab-panel-ask"
          className={`tab${tab === "ask" ? " tab-active" : ""}`}
          onClick={() => setTab("ask")}
        >
          Ask
        </button>
        <button
          type="button"
          role="tab"
          id="tab-how"
          aria-selected={tab === "how"}
          aria-controls="tab-panel-how"
          className={`tab${tab === "how" ? " tab-active" : ""}`}
          onClick={() => setTab("how")}
        >
          How it works
        </button>
      </div>

      {tab === "ask" ? (
        <div id="tab-panel-ask" role="tabpanel" aria-labelledby="tab-ask">
          <section className="panel">
            <label className="label" htmlFor="q">Question</label>
            <textarea
              id="q"
              className="textarea"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='e.g. "How does Boltline talk about traceability?"'
            />
            <div className="row">
              <label className="label inline" htmlFor="k">Chunks (top-k)</label>
              <input
                id="k"
                type="number"
                min={1}
                max={20}
                className="input-num"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
              />
              <button type="button" className="btn primary" onClick={ask} disabled={asking}>
                {asking ? "Asking…" : "Ask"}
              </button>
            </div>
            {error ? <p className="err">{error}</p> : null}
          </section>

          {result ? (
            <>
              <section className="panel answer">
                <h2>Answer</h2>
                <div className="prose">{result.answer}</div>
              </section>
              <section className="panel sources">
                <h2>Retrieved context</h2>
                <p className="hint">
                  Similarity scores are cosine between the question embedding and each chunk.
                </p>
                <ul className="source-list">
                  {result.sources.map((s, i) => (
                    <li key={`${s.sourcePath}-${s.chunkIndex}-${i}`} className="source-item">
                      <div className="source-meta">
                        <span className="badge">{s.score.toFixed(4)}</span>
                        <span className="path">{s.sourcePath} #{s.chunkIndex}</span>
                      </div>
                      <pre className="snippet">{s.text}</pre>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      ) : (
        <div id="tab-panel-how" role="tabpanel" aria-labelledby="tab-how">
          <HowItWorks />
        </div>
      )}
    </div>
  );
}
