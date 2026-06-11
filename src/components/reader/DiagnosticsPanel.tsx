import { useDiagnosticsStore } from "../../stores/diagnostics";

export function DiagnosticsPanel({ onSnapshot }: { onSnapshot: () => void }) {
  const { isOpen, entries, snapshot, toggle, clear } = useDiagnosticsStore();

  if (!isOpen) return null;

  const report = JSON.stringify({ snapshot, entries }, null, 2);

  return (
    <aside className="absolute right-2 top-14 bottom-2 z-40 w-[min(48rem,70vw)] rounded-lg border border-red-500/40 bg-[#111827]/95 text-slate-100 shadow-2xl flex flex-col font-mono text-xs">
      <header className="flex items-center gap-2 border-b border-white/15 px-3 py-2">
        <strong className="text-red-300">EPUB Diagnostics</strong>
        <span className="text-slate-400">{entries.length} events</span>
        <div className="ml-auto flex gap-2">
          <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={onSnapshot}>
            Snapshot
          </button>
          <button
            className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            onClick={() => navigator.clipboard.writeText(report)}
          >
            Copy JSON
          </button>
          <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={clear}>
            Clear
          </button>
          <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={toggle}>
            Close
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        {snapshot != null && (
          <details open className="mb-3">
            <summary className="cursor-pointer font-semibold text-cyan-300">Current DOM snapshot</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(snapshot, null, 2)}</pre>
          </details>
        )}

        {entries.map((entry) => (
          <details key={entry.id} open={entry.level === "error"} className="mb-1 border-b border-white/10 pb-1">
            <summary className="cursor-pointer">
              <span className={levelColor(entry.level)}>{entry.level.toUpperCase()}</span>
              {" "}
              <span className="text-slate-400">+{entry.elapsedMs.toFixed(1)}ms</span>
              {" "}
              <span>{entry.event}</span>
            </summary>
            {entry.data !== undefined && (
              <pre className="mt-1 whitespace-pre-wrap break-all pl-3 text-[11px] text-slate-300">
                {JSON.stringify(entry.data, null, 2)}
              </pre>
            )}
          </details>
        ))}
      </div>
    </aside>
  );
}

function levelColor(level: "info" | "warn" | "error"): string {
  if (level === "error") return "text-red-400";
  if (level === "warn") return "text-yellow-300";
  return "text-emerald-300";
}
