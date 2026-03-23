import { useState, useCallback, useRef } from "react";

const COLUMNS = [
  { key: "ref", label: "Ref / ID" },
  { key: "route", label: "Route / ELR" },
  { key: "location_from", label: "Location From" },
  { key: "location_to", label: "Location To" },
  { key: "start_datetime", label: "Start Date/Time" },
  { key: "end_datetime", label: "End Date/Time" },
  { key: "possession_type", label: "Type" },
  { key: "lines_affected", label: "Lines Affected" },
  { key: "responsible_manager", label: "Responsible Manager" },
  { key: "contractor", label: "Contractor" },
  { key: "description", label: "Work Description" },
  { key: "notes", label: "Notes" },
];

const SYSTEM_PROMPT = `You are an expert at extracting Network Rail track possession data from WONs (Weekly Operating Notices) and PONs (Possession Operating Notices).

Extract ALL possession entries from the provided text/document and return a JSON array. Each possession should be an object with these fields (use null if not found):
- ref: possession reference or ID number
- route: route name or ELR code
- location_from: start location/mileage
- location_to: end location/mileage
- start_datetime: start date and time (as a string, preserve original format)
- end_datetime: end date and time (as a string, preserve original format)
- possession_type: type of possession (e.g. Line Blockage, PICOP, ES, T3, etc.)
- lines_affected: which lines/tracks are affected
- responsible_manager: name of responsible manager or PICOP
- contractor: contractor or organisation responsible
- description: brief description of the engineering work
- notes: any other relevant notes or conditions

Return ONLY a valid JSON array, no markdown, no explanation, no backticks. If no possessions are found, return an empty array [].`;

export default function WonPonExtractor() {
  const [inputMode, setInputMode] = useState("text"); // "text" | "pdf"
  const [textInput, setTextInput] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfBase64, setPdfBase64] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extracted, setExtracted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("wonpon_anthropic_key") || "");
  const fileInputRef = useRef();

  const handleFileChange = (file) => {
    if (!file || file.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }
    setPdfFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPdfBase64(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  }, []);

  const extract = async () => {
    setLoading(true);
    setError(null);
    setExtracted(false);
    setRows([]);

    if (!apiKey.trim()) {
      setError("Please enter your Anthropic API key in the header to use the extractor.");
      setLoading(false);
      return;
    }

    try {
      let messages;

      if (inputMode === "pdf" && pdfBase64) {
        messages = [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
              },
              {
                type: "text",
                text: "Extract all track possession entries from this WON/PON document and return them as a JSON array as instructed.",
              },
            ],
          },
        ];
      } else {
        if (!textInput.trim()) {
          setError("Please paste some text to extract from.");
          setLoading(false);
          return;
        }
        messages = [
          {
            role: "user",
            content: `Extract all track possession entries from the following WON/PON content:\n\n${textInput}`,
          },
        ];
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      const data = await response.json();

      if (data.error) throw new Error(data.error.message);

      const raw = data.content.map((b) => b.text || "").join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      if (!Array.isArray(parsed)) throw new Error("Unexpected response format.");
      setRows(parsed);
      setExtracted(true);
      if (parsed.length === 0) setError("No possession entries were found in the provided content.");
    } catch (err) {
      setError("Extraction failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const header = COLUMNS.map((c) => `"${c.label}"`).join(",");
    const body = rows
      .map((row) =>
        COLUMNS.map((c) => `"${(row[c.key] ?? "").toString().replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "possessions.csv";
    a.click();
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0f1e",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      color: "#e2e8f0",
      padding: "0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0a0f1e; }
        ::-webkit-scrollbar-thumb { background: #2d3a5e; border-radius: 3px; }
        .tab-btn {
          padding: 8px 20px;
          border: 1px solid #2d3a5e;
          background: transparent;
          color: #7a8bae;
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: all 0.2s;
        }
        .tab-btn.active {
          background: #1a2540;
          color: #4fc3f7;
          border-color: #4fc3f7;
        }
        .tab-btn:first-child { border-radius: 4px 0 0 4px; }
        .tab-btn:last-child { border-radius: 0 4px 4px 0; }
        .tab-btn:hover:not(.active) { color: #a0b4d6; border-color: #3d4e6e; }
        .extract-btn {
          background: linear-gradient(135deg, #1a6bff, #0047cc);
          border: none;
          color: white;
          padding: 12px 36px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }
        .extract-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(26,107,255,0.4);
        }
        .extract-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .export-btn {
          background: transparent;
          border: 1px solid #26a65b;
          color: #26a65b;
          padding: 8px 20px;
          font-family: inherit;
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .export-btn:hover { background: rgba(38,166,91,0.1); }
        .drop-zone {
          border: 2px dashed #2d3a5e;
          border-radius: 8px;
          padding: 48px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(26,37,64,0.3);
        }
        .drop-zone.active, .drop-zone:hover {
          border-color: #4fc3f7;
          background: rgba(79,195,247,0.05);
        }
        textarea {
          width: 100%;
          height: 220px;
          background: rgba(26,37,64,0.4);
          border: 1px solid #2d3a5e;
          border-radius: 6px;
          color: #c8d8f0;
          font-family: inherit;
          font-size: 12px;
          line-height: 1.7;
          padding: 16px;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }
        textarea:focus { border-color: #4fc3f7; }
        textarea::placeholder { color: #3d4e6e; }
        .badge {
          display: inline-block;
          background: rgba(79,195,247,0.12);
          color: #4fc3f7;
          border: 1px solid rgba(79,195,247,0.3);
          padding: 2px 8px;
          border-radius: 2px;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .table-wrap {
          overflow-x: auto;
          border: 1px solid #1a2540;
          border-radius: 6px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        th {
          background: #0d1628;
          color: #4fc3f7;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #1a2540;
          white-space: nowrap;
          font-weight: 500;
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #131d34;
          color: #c8d8f0;
          vertical-align: top;
          line-height: 1.5;
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(26,107,255,0.04); }
        .null-val { color: #2d3a5e; font-style: italic; }
        .pulse { animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .slide-in {
          animation: slideIn 0.4s ease forwards;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stat-card {
          background: rgba(26,37,64,0.4);
          border: 1px solid #1a2540;
          border-radius: 6px;
          padding: 16px 20px;
        }
        .api-key-input {
          background: rgba(26,37,64,0.6);
          border: 1px solid #2d3a5e;
          border-radius: 4px;
          color: #c8d8f0;
          font-family: inherit;
          font-size: 11px;
          padding: 6px 10px;
          outline: none;
          width: 200px;
          transition: border-color 0.2s;
        }
        .api-key-input:focus { border-color: #4fc3f7; }
        .api-key-input.has-key { border-color: #26a65b; }
        .api-key-input::placeholder { color: #3d4e6e; }
      `}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #0d1628 0%, #0a0f1e 100%)",
        borderBottom: "1px solid #1a2540",
        padding: "24px 40px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        flexWrap: "wrap",
      }}>
        <div style={{
          width: 36,
          height: 36,
          background: "linear-gradient(135deg, #1a6bff, #0047cc)",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "16px",
        }}>🛤️</div>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.01em", color: "#fff" }}>
            WON / PON Extractor
          </div>
          <div style={{ fontSize: "11px", color: "#4a5878", letterSpacing: "0.08em", marginTop: "2px" }}>
            NETWORK RAIL · AI-POWERED POSSESSION DATA EXTRACTION
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <span className="badge">PDF</span>
            <span className="badge">HTML / Web</span>
            <span className="badge">AI</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", color: "#4a5878", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              API Key
            </span>
            <input
              type="password"
              className={`api-key-input${apiKey ? " has-key" : ""}`}
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                localStorage.setItem("wonpon_anthropic_key", e.target.value);
              }}
            />
            {apiKey && <span style={{ color: "#26a65b", fontSize: "14px", lineHeight: 1 }}>●</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "36px 40px" }}>

        {/* Input card */}
        <div style={{
          background: "rgba(13,22,40,0.6)",
          border: "1px solid #1a2540",
          borderRadius: "10px",
          padding: "28px",
          marginBottom: "28px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", color: "#7a8bae", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Input Source
            </div>
            <div style={{ display: "flex" }}>
              <button className={`tab-btn ${inputMode === "text" ? "active" : ""}`} onClick={() => { setInputMode("text"); setError(null); }}>
                Paste Text / HTML
              </button>
              <button className={`tab-btn ${inputMode === "pdf" ? "active" : ""}`} onClick={() => { setInputMode("pdf"); setError(null); }}>
                Upload PDF
              </button>
            </div>
          </div>

          {inputMode === "text" ? (
            <textarea
              placeholder="Paste WON/PON content here — copied from a web portal, HTML source, or any text format. The AI will find and structure all possession entries automatically."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
          ) : (
            <div
              className={`drop-zone ${dragOver ? "active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
              {pdfFile ? (
                <div>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>📄</div>
                  <div style={{ color: "#4fc3f7", fontWeight: 500, marginBottom: "4px" }}>{pdfFile.name}</div>
                  <div style={{ color: "#4a5878", fontSize: "11px" }}>{(pdfFile.size / 1024).toFixed(1)} KB · Click to replace</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "28px", marginBottom: "12px" }}>⬆️</div>
                  <div style={{ color: "#7a8bae", marginBottom: "6px" }}>Drop your PDF here, or click to browse</div>
                  <div style={{ color: "#3d4e6e", fontSize: "11px" }}>Supports WON and PON documents in PDF format</div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: "14px",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "4px",
              padding: "10px 14px",
              color: "#f87171",
              fontSize: "12px",
            }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              className="extract-btn"
              onClick={extract}
              disabled={loading || (inputMode === "pdf" && !pdfBase64) || (inputMode === "text" && !textInput.trim())}
            >
              {loading ? (
                <span className="pulse">Extracting...</span>
              ) : "Extract Possessions"}
            </button>
            {loading && (
              <span style={{ color: "#4a5878", fontSize: "11px" }}>
                AI is reading the document and structuring the data…
              </span>
            )}
          </div>
        </div>

        {/* Results */}
        {extracted && rows.length > 0 && (
          <div className="slide-in">
            {/* Stats row */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
              <div className="stat-card">
                <div style={{ fontSize: "28px", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#4fc3f7" }}>{rows.length}</div>
                <div style={{ fontSize: "10px", color: "#4a5878", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>Possessions Found</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: "28px", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#a78bfa" }}>
                  {[...new Set(rows.map(r => r.route).filter(Boolean))].length}
                </div>
                <div style={{ fontSize: "10px", color: "#4a5878", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>Unique Routes</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: "28px", fontFamily: "'Syne', sans-serif", fontWeight: 800, color: "#34d399" }}>
                  {[...new Set(rows.map(r => r.possession_type).filter(Boolean))].length}
                </div>
                <div style={{ fontSize: "10px", color: "#4a5878", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>Possession Types</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                <button className="export-btn" onClick={exportCSV}>↓ Export CSV</button>
              </div>
            </div>

            {/* Table */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "32px" }}>#</th>
                    {COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: "#3d4e6e", textAlign: "center" }}>{i + 1}</td>
                      {COLUMNS.map(c => (
                        <td key={c.key}>
                          {row[c.key] != null && row[c.key] !== ""
                            ? <span>{row[c.key]}</span>
                            : <span className="null-val">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: "12px", fontSize: "11px", color: "#2d3a5e" }}>
              {rows.length} possession{rows.length !== 1 ? "s" : ""} extracted · Export to CSV to use in Excel or other tools
            </div>
          </div>
        )}

        {extracted && rows.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "48px", color: "#3d4e6e" }}>
            No possession entries were detected in the provided content.
          </div>
        )}
      </div>
    </div>
  );
}
