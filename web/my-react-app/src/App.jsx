import { useEffect, useState } from "react";
import "./App.css";

// Change this if your API runs on a different port/host
const API_BASE = "http://localhost:3000/v1";

export default function App() {
  // Ingest
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");

  // Search
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchMsg, setSearchMsg] = useState("");

  // List nodes
  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);

  async function ingestNode() {
    setIngestLoading(true);
    setIngestMsg("");
    try {
      const res = await fetch(`${API_BASE}/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Ingest failed");
      setIngestMsg(`✔ Ingested: ${data.item_id} (chunks: ${data.chunks})`);
      // refresh list
      loadNodes();
      setText("");
    } catch (e) {
      setIngestMsg(`✖ ${e.message}`);
    } finally {
      setIngestLoading(false);
    }
  }

  async function doSearch() {
    setSearchLoading(true);
    setSearchMsg("");
    setResults([]);
    try {
      const res = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query)}&k=8`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Search failed");
      setResults(Array.isArray(data) ? data : []);
      if (!data?.length) setSearchMsg("No matches found.");
    } catch (e) {
      setSearchMsg(`✖ ${e.message}`);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadNodes() {
    setNodesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/nodes?limit=50`);
      const data = await res.json();
      setNodes(Array.isArray(data) ? data : []);
    } catch {
      // ignore for MVP
    } finally {
      setNodesLoading(false);
    }
  }

  useEffect(() => {
    loadNodes();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, Segoe UI, Arial", padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1>SecondBrain — Dev UI</h1>

      {/* INGEST */}
      <section style={card}>
        <h2>Ingest Node</h2>
        <input
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={input}
        />
        <textarea
          placeholder="Paste your text…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          style={{ ...input, height: 120 }}
        />
        <button onClick={ingestNode} disabled={ingestLoading || !text.trim()} style={btn}>
          {ingestLoading ? "Ingesting…" : "Ingest"}
        </button>
        {!!ingestMsg && <p style={msg}>{ingestMsg}</p>}
      </section>

      {/* SEARCH */}
      <section style={card}>
        <h2>Search</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Query text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...input, flex: 1 }}
          />
          <button onClick={doSearch} disabled={searchLoading || !query.trim()} style={btn}>
            {searchLoading ? "Searching…" : "Search"}
          </button>
        </div>

        {!!searchMsg && <p style={msg}>{searchMsg}</p>}

        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {results.map((r, i) => (
            <li key={i} style={resultItem}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                score {r.score?.toFixed?.(3)} • item {r.item_id} • chunk {r.chunk_index}
              </div>
              <div style={{ fontWeight: 600 }}>{r.title || "(no title)"}</div>
              <div>{r.text}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* ALL NODES */}
      <section style={card}>
        <h2>
          All Nodes{" "}
          <button onClick={loadNodes} disabled={nodesLoading} style={{ ...btn, padding: "4px 10px", marginLeft: 8 }}>
            {nodesLoading ? "…" : "Refresh"}
          </button>
        </h2>
        {!nodes.length && <p style={msg}>No nodes yet. Ingest something above.</p>}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {nodes.map((n) => (
            <li key={n.item_id} style={resultItem}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>item {n.item_id}</div>
              <div style={{ fontWeight: 600 }}>{n.title || "(no title)"}</div>
              <div>{n.preview}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// quick inline styles
const card = { border: "1px solid #e3e3e3", borderRadius: 12, padding: 16, margin: "16px 0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" };
const input = { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" };
const btn = { padding: "8px 14px", borderRadius: 10, border: "1px solid #888", background: "#fff", cursor: "pointer" };
const resultItem = { padding: 12, borderRadius: 8, border: "1px solid #eee", marginBottom: 8, background: "#fafafa" };
const msg = { marginTop: 8, color: "#444" };
