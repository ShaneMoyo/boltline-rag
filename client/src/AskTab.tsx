import type { AskResponse } from "./askTypes.ts";
import type { Conversation } from "./conversationTypes.ts";

type AskTabProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  topK: number;
  onTopKChange: (value: number) => void;
  asking: boolean;
  error: string | null;
  /** When history is unavailable, show the last Q/A here. */
  ephemeralResult: AskResponse | null;
  ephemeralQuestion: string | null;
  /** Loaded conversation thread (includes persisted turns). */
  thread: Conversation | null;
  onAsk: () => void;
};

function TurnPanels({
  question,
  answer,
  sources,
}: {
  question: string;
  answer: string;
  sources: AskResponse["sources"];
}) {
  return (
    <>
      <section className="panel turn-thread-q">
        <h2 className="turn-heading">Question</h2>
        <div className="prose">{question}</div>
      </section>
      <section className="panel answer">
        <h2>Answer</h2>
        <div className="prose">{answer}</div>
      </section>
      <section className="panel sources">
        <h2>Retrieved context</h2>
        <p className="hint">
          Similarity scores are cosine between the question embedding and each chunk.
        </p>
        <ul className="source-list">
          {sources.map((s, i) => (
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
  );
}

export default function AskTab({
  question,
  onQuestionChange,
  topK,
  onTopKChange,
  asking,
  error,
  ephemeralResult,
  ephemeralQuestion,
  thread,
  onAsk,
}: AskTabProps) {
  const showEphemeral = Boolean(ephemeralResult && !thread && ephemeralQuestion);

  return (
    <div id="tab-panel-ask" role="tabpanel" aria-labelledby="tab-ask">
      <section className="panel" aria-busy={asking}>
        <label className="label" htmlFor="q">
          Question
        </label>
        <textarea
          id="q"
          className="textarea"
          rows={3}
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder='e.g. "How does Boltline talk about traceability?"'
          disabled={asking}
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
            onChange={(e) => onTopKChange(Number(e.target.value))}
            disabled={asking}
          />
          <button type="button" className="btn primary" onClick={onAsk} disabled={asking}>
            {asking ? "Asking…" : "Ask"}
          </button>
        </div>
        {asking ? (
          <div className="ask-loading" role="status" aria-live="polite">
            <span className="spinner" aria-hidden />
            <span>Retrieving snippets and generating an answer…</span>
          </div>
        ) : null}
        {error ? <p className="err">{error}</p> : null}
      </section>

      {thread?.turns?.length ? (
        <div className="thread-stack">
          {thread.turns.map((turn) => (
            <div key={turn.id} className="thread-turn">
              <TurnPanels question={turn.question} answer={turn.answer} sources={turn.sources} />
            </div>
          ))}
        </div>
      ) : null}

      {showEphemeral && ephemeralResult && ephemeralQuestion ? (
        <TurnPanels
          question={ephemeralQuestion}
          answer={ephemeralResult.answer}
          sources={ephemeralResult.sources}
        />
      ) : null}
    </div>
  );
}
