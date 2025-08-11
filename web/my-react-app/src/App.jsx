import { useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000/v1";

export default function App() {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function ask() {
    const q = input.trim();
    if (!q) return;
    setBusy(true); setErr(""); setAnswer(""); setNotes([]);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, k: 12 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "chat failed");
      setAnswer(data.answer || "No relevant notes found.");
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, Segoe UI, Arial", padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h1>SecondBrain — Chat</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        {/* Left: Chat */}
        <div style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder='Ask: "What did I write on copywriting?"'
              style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            />
            <button onClick={ask} disabled={busy || !input.trim()} style={{ padding: "10px 16px", borderRadius: 10 }}>
              {busy ? "…" : "Send"}
            </button>
          </div>

          {err && <p style={{ color: "#b91c1c", marginTop: 8 }}>✖ {err}</p>}
          {!!answer && (
            <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
              <strong>Answer</strong>
              <div style={{ marginTop: 6 }}>{answer}</div>
            </div>
          )}
        </div>

        {/* Right: Supporting notes */}
        <div style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 16 }}>
          <h3>Relevant Notes</h3>
          {!notes.length && <p style={{ color: "#666" }}>No matches yet.</p>}
          {notes.map((it) => (
            <div key={it.item_id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>item {it.item_id}</div>
              <div style={{ fontWeight: 600 }}>{it.title || "(untitled)"}</div>
              <div>{it.chunks?.[0]?.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
