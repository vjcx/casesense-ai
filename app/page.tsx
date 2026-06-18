"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  LayoutDashboard,
  Upload,
  History,
  Brain,
  AlertTriangle,
  TrendingUp,
  FileText,
  X,
  Loader2,
  ChevronDown,
  User,
  BarChart3,
  Shield,
  Zap,
  Target,
  ClipboardPaste,
  FilePlus2,
  Users,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowUpCircle,
  Gauge,
  Lightbulb,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisPayload {
  assigneeName: string;
  outcomeStatus: string;
  executionQuality: string;
  efficiencyScore: number;
  executiveSummary: string;
  actionableInsights: string[];
}

interface CaseRecord {
  id: string;
  fileName: string;
  agentName: string;
  caseStatus: string;
  date: string;
  rawText: string;
  analysis: AnalysisPayload;
}

type TabId = "dashboard" | "upload" | "history";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "casecritic_cases";

// ---------------------------------------------------------------------------
// Badge Component
// ---------------------------------------------------------------------------

function Badge({ type, value }: { type: string; value: string | number }) {
  const colorMap: Record<string, Record<string, string>> = {
    outcome: {
      Successful: "bg-emerald-100 text-emerald-700 ring-emerald-300",
      Neutral: "bg-slate-100 text-slate-600 ring-slate-300",
      Unsuccessful: "bg-red-100 text-red-700 ring-red-300",
      Escalated: "bg-orange-100 text-orange-700 ring-orange-300",
    },
    quality: {
      Excellent: "bg-emerald-100 text-emerald-700 ring-emerald-300",
      Good: "bg-blue-100 text-blue-700 ring-blue-300",
      Standard: "bg-slate-100 text-slate-600 ring-slate-300",
      Poor: "bg-red-100 text-red-700 ring-red-300",
    },
  };

  if (type === "efficiency") {
    const n = typeof value === "number" ? value : parseInt(String(value), 10);
    // Higher is better for efficiency
    const cls =
      n >= 70
        ? "bg-emerald-100 text-emerald-700 ring-emerald-300"
        : n >= 40
        ? "bg-orange-100 text-orange-700 ring-orange-300"
        : "bg-red-100 text-red-700 ring-red-300";
    return (
      <span
        className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-xs font-bold ring-2 ${cls}`}
      >
        {n}
      </span>
    );
  }

  const palette = colorMap[type] ?? {};
  const cls = palette[String(value)] ?? "bg-slate-100 text-slate-600 ring-slate-300";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${cls}`}
    >
      {String(value)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Efficiency dot (small colored circle for lists)
// ---------------------------------------------------------------------------

function EfficiencyDot({ score }: { score: number }) {
  // Higher is better
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-orange-400" : "bg-red-500";
  return (
    <span className="relative flex h-3 w-3">
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-40 ${color}`}
        style={{ animation: "pulse-ring 1.5s ease-out infinite" }}
      />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// AI Integration (calls server-side API route)
// ---------------------------------------------------------------------------

async function analyzeTextWithAI(text: string): Promise<AnalysisPayload> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error || `API ${res.status}`);
      }
      return (await res.json()) as AnalysisPayload;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError ?? new Error("AI analysis failed after retries.");
}

// ---------------------------------------------------------------------------
// PDF extraction helper (loads pdf.js from CDN)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLibPromise: Promise<any> | null = null;

function loadPdfJs() {
  if (pdfjsLibPromise) return pdfjsLibPromise;
  pdfjsLibPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("SSR");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).pdfjsLib) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return resolve((window as any).pdfjsLib);
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
        resolve(lib);
      } else {
        reject("pdfjsLib not found after script load");
      }
    };
    script.onerror = () => reject("Failed to load pdf.js CDN");
    document.head.appendChild(script);
  });
  return pdfjsLibPromise;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages.push(content.items.map((item: any) => item.str).join(" "));
  }
  return pages.join("\n\n");
}

// ---------------------------------------------------------------------------
// Text field extraction helpers
// ---------------------------------------------------------------------------

function extractField(text: string, key: string): string {
  // Escape special regex characters in the key
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // We try multiple patterns in order of specificity:
  //   1. "Key: Value" or "Key - Value"  (explicit delimiter)
  //   2. "Key<tab(s)>Value"             (tab separated)
  //   3. "Key   Value"                  (2+ spaces – Wolken format, no colons)
  //   4. "Key Value"                    (single space, fallback)
  // All patterns require the key to appear at the START of a line to avoid
  // matching "Customer Status" when searching for "Status".
  const patterns = [
    new RegExp(`(?:^|\\n)[ \\t]*${esc}\\s*[:\\-\u2013]\\s*(.+)`, "i"),
    new RegExp(`(?:^|\\n)[ \\t]*${esc}\\t+(.+)`, "i"),
    new RegExp(`(?:^|\\n)[ \\t]*${esc}  +(.+)`, "i"),
    new RegExp(`(?:^|\\n)[ \\t]*${esc} (.+)`, "i"),
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) {
      // Trim and strip trailing whitespace / carriage returns
      const val = match[1].trim();
      if (val) return val;
    }
  }
  return "";
}

function extractCaseOwner(text: string): string {
  return (
    extractField(text, "Case Owner") ||
    extractField(text, "Agent Name") ||
    extractField(text, "Assigned To") ||
    extractField(text, "Created By") ||
    extractField(text, "Owner")
  );
}

function extractCaseStatus(text: string): string {
  // Try the primary "Status" field first (appears as its own line),
  // then fall back to more specific keys
  return (
    extractField(text, "Status") ||
    extractField(text, "Case Status") ||
    extractField(text, "Customer Status") ||
    extractField(text, "Current Status")
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CaseSenseApp() {
  // -- State -----------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [currentAgentName, setCurrentAgentName] = useState("");
  const [dashboardAgentFilter, setDashboardAgentFilter] = useState("All");
  const [historyAgentFilter, setHistoryAgentFilter] = useState("All");
  const [inputMode, setInputMode] = useState<"pdf" | "text">("pdf");
  const [pastedText, setPastedText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Persistence -----------------------------------------------------------
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCases(JSON.parse(stored));
    } catch {
      /* ignore corrupt data */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
      } catch {
        /* quota exceeded */
      }
    }
  }, [cases, hydrated]);

  // -- Derived ---------------------------------------------------------------
  const allAgents = useMemo(() => {
    const set = new Set(cases.map((c) => c.agentName));
    return Array.from(set).sort();
  }, [cases]);

  const filteredCases = useCallback(
    (filter: string) =>
      filter === "All" ? cases : cases.filter((c) => c.agentName === filter),
    [cases]
  );

  const dashboardCases = useMemo(
    () => filteredCases(dashboardAgentFilter),
    [filteredCases, dashboardAgentFilter]
  );

  const historyCases = useMemo(
    () => filteredCases(historyAgentFilter),
    [filteredCases, historyAgentFilter]
  );

  const metrics = useMemo(() => {
    if (dashboardCases.length === 0)
      return { avgEfficiency: 0, poorQualityCount: 0, topOutcome: "N/A" };
    const avgEfficiency =
      dashboardCases.reduce((a, c) => a + c.analysis.efficiencyScore, 0) /
      dashboardCases.length;
    const poorQualityCount = dashboardCases.filter(
      (c) =>
        c.analysis.executionQuality === "Poor" ||
        c.analysis.executionQuality === "Standard"
    ).length;
    const outcomeCounts: Record<string, number> = {};
    dashboardCases.forEach((c) => {
      outcomeCounts[c.analysis.outcomeStatus] =
        (outcomeCounts[c.analysis.outcomeStatus] || 0) + 1;
    });
    const topOutcome = Object.entries(outcomeCounts).sort(
      (a, b) => b[1] - a[1]
    )[0][0];
    return {
      avgEfficiency: Math.round(avgEfficiency),
      poorQualityCount,
      topOutcome,
    };
  }, [dashboardCases]);

  // Per-agent stats for agent overview table
  const agentStats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; effSum: number; outcomeCounts: Record<string, number> }
    >();
    cases.forEach((c) => {
      const entry = map.get(c.agentName) || {
        total: 0,
        effSum: 0,
        outcomeCounts: {} as Record<string, number>,
      };
      entry.total++;
      entry.effSum += c.analysis.efficiencyScore;
      entry.outcomeCounts[c.analysis.outcomeStatus] =
        (entry.outcomeCounts[c.analysis.outcomeStatus] || 0) + 1;
      map.set(c.agentName, entry);
    });
    return Array.from(map.entries()).map(([name, s]) => ({
      name,
      total: s.total,
      avgEfficiency: Math.round(s.effSum / s.total),
      topOutcome: Object.entries(s.outcomeCounts).sort(
        (a, b) => b[1] - a[1]
      )[0][0],
    }));
  }, [cases]);

  // -- Handlers --------------------------------------------------------------

  const processCase = async (text: string, fileName: string) => {
    if (!currentAgentName.trim()) {
      setPdfError("Please enter a support agent name.");
      return;
    }
    setIsProcessing(true);
    setPdfError("");
    try {
      setProcessingStatus("Analyzing case via AI...");
      const analysis = await analyzeTextWithAI(text);
      const status = extractCaseStatus(text) || "Unknown";
      const newCase: CaseRecord = {
        id: crypto.randomUUID(),
        fileName,
        agentName: currentAgentName.trim(),
        caseStatus: status,
        date: new Date().toISOString(),
        rawText: text,
        analysis,
      };
      setCases((prev) => [newCase, ...prev]);
      setProcessingStatus("");
      setPastedText("");
      setActiveTab("dashboard");
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : "Analysis failed. Please retry."
      );
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      setPdfError("Please upload a valid PDF file.");
      return;
    }
    setIsProcessing(true);
    setPdfError("");
    try {
      setProcessingStatus("Extracting text from PDF...");
      const text = await extractTextFromPdf(file);
      if (!text.trim()) {
        setPdfError("Could not extract text. The PDF may be image-based.");
        setIsProcessing(false);
        setProcessingStatus("");
        return;
      }
      await processCase(text, file.name);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : "PDF extraction failed."
      );
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  // -- Sidebar nav items -----------------------------------------------------
  const navItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: "Dashboard Overview",
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: "upload",
      label: "Analyze New Case",
      icon: <Upload className="w-5 h-5" />,
    },
    {
      id: "history",
      label: "Case Memory",
      icon: <History className="w-5 h-5" />,
    },
  ];

  // -- Agent filter dropdown --------------------------------------------------
  const AgentFilter = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="relative inline-block">
      <select
        id="agent-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer transition-shadow hover:shadow-md"
      >
        <option value="All">All Agents</option>
        {allAgents.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin-slow" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* ===== SIDEBAR ===== */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            CaseCritic
          </h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 mt-2 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom stats */}
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileText className="w-4 h-4" />
            <span>
              {cases.length} case{cases.length !== 1 && "s"} analyzed
            </span>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* ---------- DASHBOARD TAB ---------- */}
          {activeTab === "dashboard" && (
            <section className="animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    Dashboard Overview
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Real-time insights across your support cases
                  </p>
                </div>
                <AgentFilter
                  value={dashboardAgentFilter}
                  onChange={setDashboardAgentFilter}
                />
              </div>

              {cases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                    <BarChart3 className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700">
                    No cases analyzed yet
                  </h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Upload your first PDF or paste case text to see analytics
                    here.
                  </p>
                  <button
                    onClick={() => setActiveTab("upload")}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    Analyze First Case
                  </button>
                </div>
              ) : (
                <>
                  {/* Metric cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
                    {/* Avg Efficiency */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow animate-fade-in delay-75">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-200">
                          <Gauge className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500">
                          Avg Efficiency
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-slate-800">
                        {metrics.avgEfficiency}
                        <span className="text-base font-normal text-slate-400">
                          /100
                        </span>
                      </p>
                    </div>

                    {/* Poor/Standard Quality */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow animate-fade-in delay-150">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-200">
                          <AlertTriangle className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500">
                          Needs Improvement
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-slate-800">
                        {metrics.poorQualityCount}
                      </p>
                    </div>

                    {/* Top Outcome */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow animate-fade-in delay-225">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-200">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-sm font-medium text-slate-500">
                          Top Outcome
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-slate-800">
                        {metrics.topOutcome}
                      </p>
                    </div>
                  </div>

                  {/* Agent Overview Table (only when "All" filter) */}
                  {dashboardAgentFilter === "All" &&
                    agentStats.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-8 animate-fade-in delay-300 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                          <Users className="w-5 h-5 text-indigo-500" />
                          <h3 className="font-semibold text-slate-700">
                            Agent Overview
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                                <th className="px-5 py-3 font-medium">
                                  Agent Name
                                </th>
                                <th className="px-5 py-3 font-medium">
                                  Total Cases
                                </th>
                                <th className="px-5 py-3 font-medium">
                                  Avg Efficiency
                                </th>
                                <th className="px-5 py-3 font-medium">
                                  Top Outcome
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {agentStats.map((a) => (
                                <tr
                                  key={a.name}
                                  className="hover:bg-slate-50/60 transition-colors"
                                >
                                  <td className="px-5 py-3 font-medium text-slate-700 flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                      {a.name.charAt(0).toUpperCase()}
                                    </div>
                                    {a.name}
                                  </td>
                                  <td className="px-5 py-3 text-slate-600">
                                    {a.total}
                                  </td>
                                  <td className="px-5 py-3">
                                    <Badge type="efficiency" value={a.avgEfficiency} />
                                  </td>
                                  <td className="px-5 py-3">
                                    <Badge
                                      type="outcome"
                                      value={a.topOutcome}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {/* Recently Analyzed */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 animate-fade-in delay-300">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-semibold text-slate-700">
                          Recently Analyzed
                        </h3>
                      </div>
                      {dashboardCases.length > 5 && (
                        <button
                          onClick={() => setActiveTab("history")}
                          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-1"
                        >
                          View all <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-50">
                      {dashboardCases.slice(0, 5).map((c) => (
                        <li
                          key={c.id}
                          onClick={() => setSelectedCase(c)}
                          className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/60 transition-colors"
                        >
                          <EfficiencyDot score={c.analysis.efficiencyScore} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {c.analysis.executiveSummary}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              <span className="font-medium text-slate-500">
                                {c.agentName}
                              </span>{" "}
                              ·{" "}
                              {new Date(c.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <Badge type="outcome" value={c.analysis.outcomeStatus} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ---------- UPLOAD TAB ---------- */}
          {activeTab === "upload" && (
            <section className="max-w-2xl mx-auto animate-fade-in">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800">
                  Analyze New Case
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Upload a Wolken case summary PDF or paste the text directly
                </p>
              </div>

              {/* Agent Name */}
              <label
                htmlFor="agent-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Support Agent Name{" "}
                <span className="text-red-400">*</span>
              </label>
              <div className="relative mb-6">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="agent-name"
                  type="text"
                  value={currentAgentName}
                  onChange={(e) => setCurrentAgentName(e.target.value)}
                  placeholder="e.g. Shiv"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-shadow shadow-sm"
                />
              </div>

              {/* Toggle */}
              <div className="flex gap-2 mb-6">
                <button
                  id="toggle-pdf"
                  onClick={() => setInputMode("pdf")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    inputMode === "pdf"
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                      : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  PDF Upload
                </button>
                <button
                  id="toggle-text"
                  onClick={() => setInputMode("text")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    inputMode === "text"
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                      : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Paste Text
                </button>
              </div>

              {/* Error */}
              {pdfError && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 animate-scale-in">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{pdfError}</span>
                </div>
              )}

              {/* Processing overlay */}
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-300">
                      <Loader2 className="w-8 h-8 text-white animate-spin-slow" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-600">
                    {processingStatus}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    This may take a moment…
                  </p>
                </div>
              ) : inputMode === "pdf" ? (
                /* Drop zone */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    dragActive
                      ? "border-indigo-400 bg-indigo-50/60 shadow-lg shadow-indigo-100"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    id="file-input"
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                    <Upload className="w-7 h-7 text-indigo-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    Drag & drop your PDF here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    or click to browse · PDF files only
                  </p>
                </div>
              ) : (
                /* Text area */
                <div className="space-y-4">
                  <textarea
                    id="paste-text"
                    value={pastedText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPastedText(val);
                      // Auto-extract agent name from Case Owner field
                      const owner = extractCaseOwner(val);
                      if (owner) setCurrentAgentName(owner);
                    }}
                    rows={10}
                    placeholder={`Paste the full case summary text here…\n\nExample:\nCase Owner: John Doe\nStatus: Open\nDescription: Customer reported…`}
                    className="w-full p-4 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none shadow-sm font-mono text-slate-700"
                  />
                  {/* Extracted fields preview */}
                  {pastedText.trim() && (extractCaseOwner(pastedText) || extractCaseStatus(pastedText)) && (
                    <div className="flex items-center gap-3 flex-wrap text-xs px-1">
                      {extractCaseOwner(pastedText) && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-medium">
                          <User className="w-3 h-3" />
                          Owner: {extractCaseOwner(pastedText)}
                        </span>
                      )}
                      {extractCaseStatus(pastedText) && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 font-medium">
                          <CircleDot className="w-3 h-3" />
                          Status: {extractCaseStatus(pastedText)}
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    id="analyze-text-btn"
                    onClick={() => {
                      if (!pastedText.trim()) {
                        setPdfError("Please paste some case text first.");
                        return;
                      }
                      processCase(pastedText, "pasted-text.txt");
                    }}
                    disabled={!pastedText.trim() || !currentAgentName.trim()}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Target className="w-4 h-4" />
                    Analyze Case
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ---------- HISTORY TAB ---------- */}
          {activeTab === "history" && (
            <section className="animate-fade-in">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    Case Memory
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Browse all analyzed cases
                  </p>
                </div>
                <AgentFilter
                  value={historyAgentFilter}
                  onChange={setHistoryAgentFilter}
                />
              </div>

              {historyCases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <History className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700">
                    No cases found
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {cases.length === 0
                      ? "Analyze your first case to get started."
                      : "No cases match the selected filter."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {historyCases.map((c, i) => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCase(c)}
                      className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all cursor-pointer animate-fade-in"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="text-sm font-semibold text-slate-700 truncate">
                              {c.fileName}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mb-3 line-clamp-2">
                            {c.analysis.executiveSummary}
                          </p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge
                              type="outcome"
                              value={c.analysis.outcomeStatus}
                            />
                            <Badge
                              type="quality"
                              value={c.analysis.executionQuality}
                            />
                            <Badge
                              type="efficiency"
                              value={c.analysis.efficiencyScore}
                            />
                            {c.caseStatus && c.caseStatus !== "Unknown" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 bg-amber-50 text-amber-700 ring-amber-200">
                                <CircleDot className="w-3 h-3" />
                                {c.caseStatus}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-slate-400">
                            {new Date(c.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-xs font-medium text-indigo-500 mt-1 flex items-center gap-1 justify-end">
                            <User className="w-3 h-3" />
                            {c.agentName}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ===== CASE DETAILS MODAL ===== */}
      {selectedCase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCase(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" />

          {/* Modal */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">
                    Case Analysis
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedCase.fileName} ·{" "}
                    {new Date(selectedCase.date).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <button
                id="modal-close"
                onClick={() => setSelectedCase(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 max-h-[calc(90vh-64px)] overflow-y-auto">
              {/* Left – Analysis */}
              <div className="p-6 space-y-6">
                {/* Badges row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    type="outcome"
                    value={selectedCase.analysis.outcomeStatus}
                  />
                  <Badge
                    type="quality"
                    value={selectedCase.analysis.executionQuality}
                  />
                  <Badge
                    type="efficiency"
                    value={selectedCase.analysis.efficiencyScore}
                  />
                </div>

                {/* Agent & Status */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                      {selectedCase.agentName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      {selectedCase.agentName}
                    </span>
                  </div>
                  {selectedCase.caseStatus && selectedCase.caseStatus !== "Unknown" && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 ring-1 ring-amber-200">
                      <CircleDot className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-700">
                        {selectedCase.caseStatus}
                      </span>
                    </div>
                  )}
                </div>

                {/* Executive Summary */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Executive Summary
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {selectedCase.analysis.executiveSummary}
                  </p>
                </div>

                {/* Actionable Insights */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Actionable Insights
                  </h4>
                  <ul className="space-y-2.5">
                    {selectedCase.analysis.actionableInsights.map((insight, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-sm text-slate-600"
                      >
                        {idx < 3 ? (
                          <Lightbulb className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                        ) : (
                          <Zap className="w-4 h-4 mt-0.5 text-indigo-400 flex-shrink-0" />
                        )}
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right – Raw Text */}
              <div className="p-6">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Extracted Text
                </h4>
                <div className="bg-slate-50 rounded-xl p-4 max-h-[60vh] overflow-y-auto">
                  <pre className="font-mono text-xs text-slate-600 whitespace-pre-wrap break-words leading-relaxed">
                    {selectedCase.rawText}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
