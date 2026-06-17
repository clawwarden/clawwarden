"use client";

import { useRef, useState } from "react";
import { Upload, X, Database, ChevronDown, ChevronUp, FileText } from "lucide-react";

export interface CsvData {
  fileName: string;
  headers: string[];
  rows: string[][];
}

interface Props {
  data: CsvData | null;
  onDataLoaded: (data: CsvData | null) => void;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
      if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; continue; }
      if (ch === '"' && inQuotes) { inQuotes = false; continue; }
      if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(parseRow);
  return { headers, rows };
}

// ── Column classification ─────────────────────────────────────────────────
// These keywords identify columns that hold direct personal identifiers.
// Everything else is treated as an analytics dimension and passed unmasked.
const PII_COLUMN_KEYWORDS = [
  "name", "email", "ssn", "social", "phone", "mobile", "fax",
  "account", "acct", "loan id", "loan_id", "dob", "birth", "date of birth",
  "address", "addr", "zip", "postal", "routing",
];

function classifyColumns(headers: string[]): { piiCols: string[]; analyticsCols: string[] } {
  const piiCols: string[] = [];
  const analyticsCols: string[] = [];
  for (const h of headers) {
    const lower = h.toLowerCase();
    if (PII_COLUMN_KEYWORDS.some((k) => lower.includes(k))) {
      piiCols.push(h);
    } else {
      analyticsCols.push(h);
    }
  }
  return { piiCols, analyticsCols };
}

export function csvToSystemPrompt(data: CsvData): string {
  const maxRows = 200;
  const sliced = data.rows.slice(0, maxRows);
  const { piiCols, analyticsCols } = classifyColumns(data.headers);

  const dataLines = sliced
    .map((row, ri) =>
      "Row " + (ri + 1) + ": " +
      row.map((cell, i) => (data.headers[i] ?? i) + ": " + cell).join(" | ")
    )
    .join("\n");

  const truncNote =
    data.rows.length > maxRows
      ? "\n[Dataset truncated: showing first " + maxRows + " of " + data.rows.length + " rows]"
      : "";

  return (
    "You are a banking analytics assistant operating under a regulatory privacy-preserving tokenization layer (GLBA / GDPR compliant).\n\n" +

    "DATASET: " + data.fileName + " — " + data.rows.length + " records × " + data.headers.length + " columns\n" +
    "All columns: " + data.headers.join(", ") + "\n\n" +

    "━━ PRIVACY MODEL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "PROTECTED fields (PII — identity-linked, masked per regulation):\n" +
    "  " + (piiCols.length ? piiCols.join(", ") : "none detected") + "\n" +
    "  → Each unique value is replaced with a DETERMINISTIC, SESSION-SCOPED token\n" +
    "    e.g. {{PERSON_1}}, {{SSN_1}}, {{ACCT_2}}, {{EMAIL_3}}, {{DATE_1}}\n" +
    "  → The SAME token ALWAYS refers to the SAME individual within this session.\n" +
    "    {{PERSON_1}} in row 3 is the identical person as {{PERSON_1}} in row 7.\n" +
    "  → Use tokens as stable primary keys for individual-level analysis.\n\n" +

    "ANALYTICS fields (unmasked — real values, safe for computation):\n" +
    "  " + (analyticsCols.length ? analyticsCols.join(", ") : "all columns") + "\n" +
    "  → All numeric amounts, scores, rates, flags and categories are ACTUAL values.\n" +
    "  → Use these for aggregation, statistics, distributions, and risk analysis.\n\n" +

    "━━ WHAT YOU CAN DO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "✓ Compute averages, totals, min/max on Balance, Income, Credit Score, DTI, LTV, Risk Score, Rate, DPD\n" +
    "✓ Group and count by Risk Flag, Product Type, Employment Status, State, Industry, Branch Code\n" +
    "✓ Identify high-risk records (e.g. DPD > 30, Risk Score > 75, Delinquency Count > 2)\n" +
    "✓ Detect multi-loan customers: same token ({PERSON_N}) appearing in multiple rows = same individual\n" +
    "✓ Cross-row correlation: same token = same individual — compare their loans side by side\n" +
    "✓ Reference specific records by token: \"{{PERSON_2}}'s mortgage has LTV of 92%, credit score 601\"\n" +
    "✗ Do NOT attempt to infer, guess, or reconstruct masked identity values\n\n" +

    "━━ DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    dataLines + truncNote
  );
}

const SAMPLE_CSV = `Name,Email,SSN,Date of Birth,Phone,City,State,Account Number,Loan ID,Product Type,Outstanding Balance,Original Principal,Annual Income,Credit Score,DTI Ratio (%),LTV Ratio (%),Interest Rate (%),Monthly Payment,Loan Term (mo),Acct Age (mo),Days Past Due,Delinquency Count (12mo),Risk Score,Collateral Type,Employment Status,Industry,Branch Code,Risk Flag
Jane Smith,jane.smith@acme.com,123-45-6789,1985-03-14,415-555-0192,San Francisco,CA,ACC-00198234,LOAN-2024-0041,Mortgage,284500.00,320000,95000,742,28.4,89,4.75,1240.00,360,62,0,0,18,Real Estate,Employed,Technology,BR-CA-001,LOW
Jane Smith,jane.smith@acme.com,123-45-6789,1985-03-14,415-555-0192,San Francisco,CA,ACC-00198234,LOAN-2025-0012,Auto,18400.00,22000,95000,742,28.4,84,5.90,395.00,60,14,0,0,18,Vehicle,Employed,Technology,BR-CA-001,LOW
Robert Chen,r.chen@globex.io,987-65-4321,1979-11-02,212-555-0847,New York,NY,ACC-00874512,LOAN-2024-0078,Business,312000.00,350000,210000,688,34.2,91,6.90,4850.00,84,38,15,2,54,Equipment,Self-Employed,Finance,BR-NY-004,MEDIUM
Robert Chen,r.chen@globex.io,987-65-4321,1979-11-02,212-555-0847,New York,NY,ACC-00874512,LOAN-2025-0104,Personal,14200.00,15000,210000,688,34.2,0,8.50,312.00,60,6,0,0,54,Unsecured,Self-Employed,Finance,BR-NY-004,MEDIUM
Priya Patel,priya.patel@initech.net,456-78-9012,1992-07-28,512-555-0374,Austin,TX,ACC-00312677,LOAN-2024-0119,Personal,6200.00,8500,68000,795,19.1,0,5.10,310.00,36,28,0,0,11,Unsecured,Employed,Healthcare,BR-TX-002,LOW
Marcus Johnson,m.johnson@umbrella.co,321-54-8765,1971-01-19,312-555-0561,Chicago,IL,ACC-00564390,LOAN-2024-0203,Business,287000.00,315000,480000,601,47.8,96,8.45,6200.00,60,42,62,5,87,Equipment,Self-Employed,Retail,BR-IL-003,HIGH
Marcus Johnson,m.johnson@umbrella.co,321-54-8765,1971-01-19,312-555-0561,Chicago,IL,ACC-00564390,LOAN-2024-0388,HELOC,74500.00,85000,480000,601,47.8,94,9.10,1890.00,120,20,45,3,87,Real Estate,Self-Employed,Retail,BR-IL-003,HIGH
Linda Nguyen,linda.n@hooli.com,654-32-1098,1988-09-05,650-555-0283,Palo Alto,CA,ACC-00091847,LOAN-2024-0257,Mortgage,412000.00,450000,145000,760,22.7,91,4.50,2180.00,360,18,0,0,14,Real Estate,Employed,Technology,BR-CA-002,LOW
David Kim,d.kim@piedpiper.io,789-01-2345,1995-04-22,408-555-0715,San Jose,CA,ACC-00729103,LOAN-2024-0301,Auto,16400.00,21000,82000,711,31.5,78,7.20,540.00,48,22,30,1,61,Vehicle,Employed,Technology,BR-CA-001,MEDIUM
Sarah O'Brien,s.obrien@vehement.co,234-56-7890,1968-12-31,713-555-0926,Houston,TX,ACC-00448261,LOAN-2024-0521,Business,91000.00,100000,155000,589,52.3,0,9.80,2100.00,60,29,45,4,91,Unsecured,Self-Employed,Energy,BR-TX-001,HIGH
Amara Osei,a.osei@initech.net,876-54-3210,1983-06-17,404-555-0142,Atlanta,GA,ACC-00632019,LOAN-2024-0412,Personal,19800.00,25000,74000,734,26.8,0,5.95,720.00,48,31,0,0,22,Unsecured,Employed,Healthcare,BR-GA-001,LOW
Carlos Rivera,c.rivera@globex.io,543-21-0987,1976-02-09,305-555-0489,Miami,FL,ACC-00115872,LOAN-2024-0467,Mortgage,378000.00,410000,135000,648,43.6,92,7.60,2430.00,360,19,90,6,94,Real Estate,Self-Employed,Construction,BR-FL-002,HIGH
Carlos Rivera,c.rivera@globex.io,543-21-0987,1976-02-09,305-555-0489,Miami,FL,ACC-00115872,LOAN-2025-0071,HELOC,52000.00,60000,135000,648,43.6,95,10.20,1380.00,120,4,30,2,94,Real Estate,Self-Employed,Construction,BR-FL-002,HIGH
Ethan Brooks,e.brooks@hooli.com,210-98-7654,1990-08-14,206-555-0338,Seattle,WA,ACC-00987345,LOAN-2024-0519,Auto,29600.00,35000,98000,723,24.3,85,6.30,810.00,60,15,0,0,25,Vehicle,Employed,Technology,BR-WA-001,LOW
Fatima Al-Rashid,f.alrashid@piedpiper.io,135-79-2468,1980-05-03,214-555-0671,Dallas,TX,ACC-00456789,LOAN-2024-0574,Business,398000.00,425000,620000,667,36.1,94,8.10,8750.00,60,28,22,2,58,Equipment,Self-Employed,Manufacturing,BR-TX-003,MEDIUM
George Tanaka,g.tanaka@acme.com,864-20-9753,1973-10-27,617-555-0294,Boston,MA,ACC-00234156,LOAN-2024-0631,Mortgage,155000.00,180000,185000,779,21.5,86,4.25,1580.00,360,41,0,0,12,Real Estate,Employed,Education,BR-MA-001,LOW
Nadia Petrov,n.petrov@nexus.io,372-84-6150,1987-03-22,702-555-0413,Las Vegas,NV,ACC-00783920,LOAN-2024-0689,Personal,31200.00,35000,54000,669,38.7,0,8.90,890.00,48,17,15,1,62,Unsecured,Employed,Hospitality,BR-NV-001,MEDIUM
Kwame Asante,k.asante@meridian.co,519-37-2846,1974-08-11,404-555-0827,Atlanta,GA,ACC-00341578,LOAN-2024-0712,Business,218000.00,240000,310000,594,51.2,0,10.50,5600.00,48,33,75,5,89,Unsecured,Self-Employed,Retail,BR-GA-002,HIGH
Isabelle Moreau,i.moreau@atlas.com,683-21-9045,1991-05-30,504-555-0619,New Orleans,LA,ACC-00612834,LOAN-2024-0745,Mortgage,224000.00,250000,88000,751,30.2,90,5.20,1380.00,360,8,0,0,20,Real Estate,Employed,Education,BR-LA-001,LOW
Thomas Nguyen,t.nguyen@crestline.co,247-63-5918,1969-12-08,619-555-0254,San Diego,CA,ACC-00529167,LOAN-2024-0803,Mortgage,318000.00,360000,162000,768,25.9,88,4.65,1840.00,360,55,0,0,16,Real Estate,Employed,Government,BR-CA-003,LOW
James Whitfield,j.whitfield@redline.io,731-04-8263,1998-02-17,702-555-0981,Phoenix,AZ,ACC-00867403,LOAN-2025-0031,Personal,8900.00,9500,38000,541,58.4,0,14.50,380.00,36,3,30,3,92,Unsecured,Employed,Hospitality,BR-AZ-001,HIGH
Helen Zhao,h.zhao@summit.co,428-96-1537,1986-09-04,312-555-0748,Chicago,IL,ACC-00194652,LOAN-2024-0867,Personal,11400.00,14000,79000,758,23.6,0,6.20,380.00,48,20,0,0,17,Unsecured,Employed,Finance,BR-IL-001,LOW
Rafael Santos,r.santos@novacap.io,896-15-3742,1982-11-26,305-555-0362,Miami,FL,ACC-00738291,LOAN-2024-0891,Business,164000.00,175000,248000,672,40.3,87,7.85,4100.00,60,24,0,1,48,Equipment,Self-Employed,Construction,BR-FL-001,MEDIUM
Megan O'Sullivan,m.osullivan@arbor.co,163-47-8290,1993-06-14,617-555-0583,Boston,MA,ACC-00456013,LOAN-2024-0923,Auto,22800.00,28000,67000,703,33.1,81,7.60,620.00,60,11,0,0,33,Vehicle,Employed,Healthcare,BR-MA-002,LOW
Priya Patel,priya.patel@initech.net,456-78-9012,1992-07-28,512-555-0374,Austin,TX,ACC-00312677,LOAN-2025-0088,Auto,24500.00,26000,68000,795,19.1,94,5.45,490.00,60,2,0,0,11,Vehicle,Employed,Healthcare,BR-TX-002,LOW
`;


function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clawwarden_sample_financial_data.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvUpload({ data, onDataLoaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function handleFile(file: File) {
    setError("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a .csv file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large (max 5 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) { setError("Could not parse CSV"); return; }
      onDataLoaded({ fileName: file.name, headers, rows });
      setExpanded(true);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Loaded state ─────────────────────────────────────────────────────────
  if (data) {
    const previewRows = data.rows.slice(0, 6);
    return (
      <div
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(13,90,64,0.025)",
          flexShrink: 0,
        }}
      >
        {/* Header bar */}
        <div
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "7px 16px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <Database size={13} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.78rem", color: "var(--color-primary)", fontWeight: 700 }}>
            {data.fileName}
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              background: "rgba(23,21,15,0.05)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "100px",
              padding: "1px 8px",
            }}
          >
            {data.rows.length} rows · {data.headers.length} cols
          </span>
          <span
            style={{
              fontSize: "0.68rem",
              color: "var(--color-safe)",
              background: "var(--color-safe-dim)",
              border: "1px solid var(--border-safe)",
              borderRadius: "100px",
              padding: "1px 8px",
              fontWeight: 600,
            }}
          >
            IN CONTEXT
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDataLoaded(null);
                setExpanded(false);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: "2px 4px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                lineHeight: 1,
              }}
              title="Remove dataset"
            >
              <X size={12} />
            </button>
            {expanded ? (
              <ChevronUp size={12} style={{ color: "var(--text-muted)" }} />
            ) : (
              <ChevronDown size={12} style={{ color: "var(--text-muted)" }} />
            )}
          </div>
        </div>

        {/* Expanded preview table */}
        {expanded && (
          <div style={{ padding: "0 16px 10px", overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                fontSize: "0.7rem",
                width: "100%",
                minWidth: "300px",
              }}
            >
              <thead>
                <tr>
                  {data.headers.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "4px 10px",
                        textAlign: "left",
                        color: "var(--text-muted)",
                        borderBottom: "1px solid var(--border-subtle)",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.68rem",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri}>
                    {data.headers.map((_, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: "3px 10px",
                          color: "var(--text-secondary)",
                          borderBottom: "1px solid rgba(23,21,15,0.03)",
                          whiteSpace: "nowrap",
                          maxWidth: "180px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.68rem",
                        }}
                      >
                        {row[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length > 6 && (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "0.68rem",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                +{data.rows.length - 6} more rows — all {data.rows.length} rows injected into context
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Upload state ──────────────────────────────────────────────────────────
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(13,90,64,0.03)",
        flexShrink: 0,
      }}
    >
      {/* Section label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "8px 16px 0",
        }}
      >
        <Database size={11} style={{ color: "var(--color-primary)", opacity: 0.8 }} />
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--color-primary)",
            opacity: 0.8,
            textTransform: "uppercase",
          }}
        >
          Analyze a Dataset
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", opacity: 0.7 }}>
          — upload a CSV and ask questions about your data with PII protected
        </span>
      </div>

      {/* Drop zone + sample button row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "7px 16px 10px",
        }}
      >
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 18px",
            borderRadius: "8px",
            border: `1.5px dashed ${dragging ? "var(--color-primary)" : "rgba(13,90,64,0.28)"}`,
            background: dragging ? "rgba(13,90,64,0.08)" : "rgba(13,90,64,0.04)",
            cursor: "pointer",
            fontSize: "0.78rem",
            color: dragging ? "var(--color-primary)" : "rgba(23,21,15,0.65)",
            transition: "all 150ms ease",
            lineHeight: 1,
            flex: 1,
            maxWidth: "340px",
          }}
          onMouseEnter={(e) => {
            if (!dragging) {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,90,64,0.55)";
              (e.currentTarget as HTMLElement).style.color = "var(--color-primary)";
              (e.currentTarget as HTMLElement).style.background = "rgba(13,90,64,0.07)";
            }
          }}
          onMouseLeave={(e) => {
            if (!dragging) {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,90,64,0.28)";
              (e.currentTarget as HTMLElement).style.color = "rgba(23,21,15,0.65)";
              (e.currentTarget as HTMLElement).style.background = "rgba(13,90,64,0.04)";
            }
          }}
        >
          <Upload size={13} style={{ flexShrink: 0, opacity: 0.8 }} />
          <span style={{ fontWeight: 500 }}>Drop CSV here or click to upload</span>
          <FileText size={12} style={{ marginLeft: "auto", opacity: 0.5 }} />
        </div>

        <span style={{ fontSize: "0.7rem", color: "rgba(23,21,15,0.2)" }}>or</span>

        {/* Sample CSV — prominent green CTA */}
        <button
          onClick={downloadSampleCSV}
          style={{
            background: "rgba(13,90,64,0.1)",
            border: "1.5px solid rgba(13,90,64,0.45)",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--color-safe)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            lineHeight: 1,
            transition: "all 150ms ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(13,90,64,0.18)";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,90,64,0.75)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(13,90,64,0.1)";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,90,64,0.45)";
          }}
          title="Download 25-row financial dataset: 24 columns including DTI, LTV, delinquency count, risk score, multi-loan customers"
        >
          <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>↓</span>
          Try Sample CSV
          <span
            style={{
              fontSize: "0.63rem",
              fontWeight: 400,
              opacity: 0.75,
              background: "rgba(13,90,64,0.15)",
              border: "1px solid rgba(13,90,64,0.3)",
              borderRadius: "4px",
              padding: "1px 5px",
            }}
          >
            25 rows · 24 cols
          </span>
        </button>

        {error && (
          <span style={{ fontSize: "0.72rem", color: "var(--color-danger)" }}>{error}</span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
