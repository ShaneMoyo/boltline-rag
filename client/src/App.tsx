import { useCallback, useState } from "react";
import "./App.css";

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

export default function App() {
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      setError("Enter a question.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, topK }),
      });
      const data = (await res.json()) as { error?: string } & Partial<AskResponse>;
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText);
      }
      if (typeof data.answer !== "string" || !Array.isArray(data.sources)) {
        throw new Error("Unexpected response from server.");
      }
      setResult({ answer: data.answer, sources: data.sources });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [question, topK]);

  return (
    <div className="app">
      <header className="header">
        <h1>Boltline RAG</h1>
        <p className="subtitle">
          Interview prep over your local corpus — answers are grounded in retrieved snippets.
        </p>
      </header>

      <section className="panel">
        <label className="label" htmlFor="q">
          Question
        </label>
        <textarea
          id="q"
          className="textarea"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "How does Boltline talk about traceability?"'
        />

        <div className="row">
          <label className="label inline" htmlFor="k">
            Chunks (top-k)
          </label>
          <input
            id="k"
            type="number"
            min={1}
            max={20}
            className="input-num"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
          />
          <button type="button" className="btn primary" onClick={ask} disabled={loading}>
            {loading ? "Asking…" : "Ask"}
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
                    <span className="path">
                      {s.sourcePath} #{s.chunkIndex}
                    </span>
                  </div>
                  <pre className="snippet">{s.text}</pre>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
