import ReactDOM from "react-dom/client";
import App from "./App";
import "virtual:uno.css";
import "./styles.css";
import { toDiagnosticValue, useDiagnosticsStore } from "./stores/diagnostics";

window.addEventListener("error", (event) => {
  useDiagnosticsStore.getState().add({
    time: new Date().toISOString(),
    elapsedMs: performance.now(),
    level: "error",
    event: "window:error",
    data: toDiagnosticValue(event.error ?? event.message),
  });
});

window.addEventListener("unhandledrejection", (event) => {
  useDiagnosticsStore.getState().add({
    time: new Date().toISOString(),
    elapsedMs: performance.now(),
    level: "error",
    event: "window:unhandled-rejection",
    data: toDiagnosticValue(event.reason),
  });
});

window.moonElectron?.getDebugInfo().then((data) => {
  useDiagnosticsStore.getState().add({
    time: new Date().toISOString(),
    elapsedMs: performance.now(),
    level: "info",
    event: "electron:debug-info",
    data,
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />,
);
