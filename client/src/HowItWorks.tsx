export default function HowItWorks() {
  return (
    <article className="doc panel">
      <section className="doc-section">
        <h3 className="doc-heading">Architecture</h3>
        <p>
          I built this as a <strong>classic two-stage RAG</strong>: offline indexing (chunk → embed →
          persist) and online query (embed question → retrieve → generate). The UI talks only to a
          small Express API; all retrieval and LLM calls run on the server so keys and the vector
          index never ship to the browser.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-heading">Ingestion</h3>
        <p>
          Markdown lives under <code>corpus/</code>. I split each file by paragraph, then apply a
          sliding window with overlap so long sections stay coherent without blowing the embedding
          context budget—defaults are on the order of <strong>~1400 characters</strong> per chunk with{" "}
          <strong>~200 characters overlap</strong> (see <code>chunkMarkdown</code>).
        </p>
        <p>
          Each chunk is embedded with OpenAI&apos;s API (default embedding model{" "}
          <code>text-embedding-3-small</code>, overridable via <code>OPENAI_EMBEDDING_MODEL</code>).
          Everything is written to a single artifact, <code>data/index.json</code>: embedding model id,
          metadata, and an array of chunks each carrying its text and vector. That keeps the deploy
          simple—no hosted vector DB for this demo.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-heading">Retrieval</h3>
        <p>
          At question time I embed the user query with the <strong>same embedding model</strong>{" "}
          recorded in the index, then score every stored chunk with <strong>cosine similarity</strong>{" "}
          between the query vector and chunk vectors. I sort descending and take the top{" "}
          <em>k</em> (capped in the API). The scores you see in the UI are those cosine values—good
          for debugging retrieval quality without a separate reranker.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-heading">Generation</h3>
        <p>
          I pack the top chunks into a labeled context block and call the chat API (default{" "}
          <code>gpt-4o-mini</code>, configurable via <code>OPENAI_CHAT_MODEL</code>) with{" "}
          <strong>low temperature (0.2)</strong> so answers stay close to the retrieved text. The
          system prompt instructs the model to rely on those snippets and admit when context is thin—
          that&apos;s the main guardrail against hallucination in a small corpus.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-heading">API and operations</h3>
        <p>
          <code>POST /api/ask</code> is behind <strong>Google Sign-In</strong> (ID token verified on
          the server, session cookie) and a <strong>rate limit</strong> (20 requests per 15 minutes
          per IP) so casual abuse doesn&apos;t burn tokens. Health and auth routes stay separate from
          the RAG path so deployment checks stay simple.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-heading">Why I chose this shape</h3>
        <ul className="doc-list">
          <li>
            <strong>JSON index vs managed vector store</strong> — fewer moving parts for a demo;
            tradeoff is you re-ingest when the corpus or embedding model changes.
          </li>
          <li>
            <strong>Cosine + top-k</strong> — fast to implement and explain; no neural reranker, so
            noisy queries show up clearly in the score list.
          </li>
          <li>
            <strong>Server-side RAG only</strong> — protects API keys and keeps one consistent
            retrieval path for local dev and production (e.g. Vercel serverless + static client).
          </li>
        </ul>
      </section>
    </article>
  );
}
