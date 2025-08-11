import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000/v1";

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ask about your notes (e.g., “What did I write on copywriting?”)." }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastNotes, setLastNotes] = useState([]); // supporting docs for last answer
  const listRef = useRef(null);

  useEffect(() => {
    // autoscroll to bottom
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
  const text = input.trim();
  if (!text || busy) return;
  setInput("");
  setBusy(true);

  // add user bubble
  setMessages((m) => [...m, { role: "user", content: text }]);

  try {
    const res = await fetch(`${API_BASE}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, k: 12 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "route failed");

    if (data.action === "query") {
      const ans = data.result?.answer || "No relevant notes found.";
      setLastNotes(Array.isArray(data.result?.notes) ? data.result.notes : []);
      setMessages((m) => [...m, { role: "assistant", content: ans }]);
    } else if (data.action === "ingest") {
      const chunks = data.result?.chunks ?? 0;
      setLastNotes([]); // nothing to show in Sources for ingest
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `✅ Saved to notes (${chunks} chunk${chunks === 1 ? "" : "s"}).` }
      ]);
    } else {
      setLastNotes([]);
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ Unknown action." }]);
    }
  } catch (e) {
    setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message}` }]);
    setLastNotes([]);
  } finally {
    setBusy(false);
  }
};

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">SecondBrain</div>
      </header>

      <main className="main">
        {/* chat column */}
        <section className="chat">
          <div className="msgs" ref={listRef}>
            {messages.map((m, i) => (
              <Message key={i} role={m.role} text={m.content} />
            ))}
            {busy && <Message role="assistant" text="Thinking…" />}
          </div>

          <div className="composer">
            <textarea
              className="input"
              placeholder='Ask something… (Shift+Enter for newline)'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
            />
            <button className="send" onClick={send} disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        </section>

        {/* notes column */}
        <aside className="notes">
          <h3>Sources</h3>
          {!lastNotes.length && <p className="muted">No sources yet. Ask a question.</p>}
          {lastNotes.map((it) => (
            <div key={it.item_id} className="note">
              <div className="note_meta">
                <span className="pill">{it.title || "(untitled)"}</span>
                <span className="muted">item {it.item_id.slice(0, 6)}…</span>
              </div>
              <div className="note_txt">{it.chunks?.[0]?.text}</div>
              {it.chunks?.length > 1 && (
                <details className="more">
                  <summary>More chunks ({it.chunks.length - 1})</summary>
                  <ul>
                    {it.chunks.slice(1).map((c, idx) => (
                      <li key={idx} className="snippet">[{c.chunk_index}] {c.text}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}

function Message({ role, text }) {
  const isUser = role === "user";
  return (
    <div className={`row ${isUser ? "user" : "assistant"}`}>
      <div className="avatar">{isUser ? "🧑" : "🤖"}</div>
      <div className="bubble">{text}</div>
    </div>
  );
}
