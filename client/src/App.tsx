import { useCallback, useState } from "react";
import "./App.css";
import AskTab from "./AskTab.tsx";
import HowItWorks from "./HowItWorks.tsx";
import { SignInView } from "./SignInView.tsx";
import { useAuth } from "./useAuth.ts";
import type { AskResponse } from "./askTypes.ts";

export default function App() {
  const {
    user,
    loading,
    bootError,
    showEmailPasswordForm,
    emailPasswordReady,
    googleEnabled,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
    signOut,
  } = useAuth();
  const [tab, setTab] = useState<"ask" | "how">("ask");
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(5);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      setError("Enter a question.");
      return;
    }
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

  if (!user)
    return (
      <SignInView
        bootError={bootError}
        showEmailPasswordForm={showEmailPasswordForm}
        emailPasswordReady={emailPasswordReady}
        googleEnabled={googleEnabled}
        onCredential={signInWithGoogle}
        onSignInEmail={signInWithEmailPassword}
        onRegisterEmail={registerWithEmailPassword}
      />
    );

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
        <AskTab
          question={question}
          onQuestionChange={setQuestion}
          topK={topK}
          onTopKChange={setTopK}
          asking={asking}
          error={error}
          result={result}
          onAsk={ask}
        />
      ) : (
        <div id="tab-panel-how" role="tabpanel" aria-labelledby="tab-how">
          <HowItWorks />
        </div>
      )}
    </div>
  );
}
