import { useCallback, useEffect, useState } from "react";
import "./App.css";
import AskTab from "./AskTab.tsx";
import ConversationSidebar from "./ConversationSidebar.tsx";
import HowItWorks from "./HowItWorks.tsx";
import { SignInView } from "./SignInView.tsx";
import { useAuth } from "./useAuth.ts";
import type { AskResponse } from "./askTypes.ts";
import type { Conversation, ConversationListItem } from "./conversationTypes.ts";

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
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadedThread, setLoadedThread] = useState<Conversation | null>(null);
  const [conversationList, setConversationList] = useState<ConversationListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ephemeralResult, setEphemeralResult] = useState<AskResponse | null>(null);
  const [ephemeralQuestion, setEphemeralQuestion] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      const data = (await res.json()) as { conversations?: ConversationListItem[]; error?: string };
      if (res.ok && Array.isArray(data.conversations)) {
        setConversationList(data.conversations);
      }
    } catch {
      /* ignore list errors; sidebar stays empty */
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && tab === "ask") void refreshList();
  }, [user, tab, refreshList]);

  const newChat = useCallback(() => {
    setActiveConversationId(null);
    setLoadedThread(null);
    setEphemeralResult(null);
    setEphemeralQuestion(null);
    setQuestion("");
    setError(null);
    setSidebarOpen(false);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    const data = (await res.json()) as { conversation?: Conversation; error?: string };
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    setLoadedThread(data.conversation ?? null);
  }, []);

  const selectConversation = useCallback(
    async (id: string) => {
      setError(null);
      setEphemeralResult(null);
      setEphemeralQuestion(null);
      setActiveConversationId(id);
      setQuestion("");
      try {
        await loadThread(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load conversation.");
      }
    },
    [loadThread]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this chat?")) return;
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete.");
        return;
      }
      if (activeConversationId === id) newChat();
      await refreshList();
    },
    [activeConversationId, newChat, refreshList]
  );

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      setError("Enter a question.");
      return;
    }
    setAsking(true);
    setError(null);
    setEphemeralResult(null);
    setEphemeralQuestion(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          topK,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string } & Partial<AskResponse>;
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (typeof data.answer !== "string" || !Array.isArray(data.sources)) {
        throw new Error("Unexpected response from server.");
      }
      if (typeof data.conversationId === "string") {
        setActiveConversationId(data.conversationId);
        setEphemeralResult(null);
        setEphemeralQuestion(null);
        const tr = await fetch(
          `/api/conversations/${encodeURIComponent(data.conversationId)}`,
          { credentials: "include" }
        );
        const td = (await tr.json()) as { conversation?: Conversation; error?: string };
        if (tr.ok && td.conversation) setLoadedThread(td.conversation);
        setQuestion("");
        await refreshList();
      } else {
        setLoadedThread(null);
        setActiveConversationId(null);
        setEphemeralQuestion(q);
        setEphemeralResult({ answer: data.answer, sources: data.sources });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setAsking(false);
    }
  }, [question, topK, activeConversationId, refreshList]);

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
    <div className={`app-shell${tab === "ask" ? " app-shell-ask" : ""}`}>
      {tab === "ask" ? (
        <ConversationSidebar
          items={conversationList}
          activeId={activeConversationId}
          loading={listLoading}
          openMobile={sidebarOpen}
          onToggleMobile={() => setSidebarOpen((o) => !o)}
          onCloseMobile={() => setSidebarOpen(false)}
          onSelect={selectConversation}
          onNewChat={newChat}
          onDelete={deleteConversation}
        />
      ) : null}

      <div className="app-main">
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
            ephemeralResult={ephemeralResult}
            ephemeralQuestion={ephemeralQuestion}
            thread={loadedThread}
            onAsk={ask}
          />
        ) : (
          <div id="tab-panel-how" role="tabpanel" aria-labelledby="tab-how">
            <HowItWorks />
          </div>
        )}
      </div>
    </div>
  );
}
