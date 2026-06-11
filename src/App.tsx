import { AppShell } from "./components/layout/AppShell";
import { LibraryView } from "./components/library/LibraryView";
import { ReaderView } from "./components/reader/ReaderView";
import { useReaderStore } from "./stores/reader";

function App() {
  const view = useReaderStore((s) => s.view);

  return (
    <AppShell>
      {view === "library" ? <LibraryView /> : <ReaderView />}
    </AppShell>
  );
}

export default App;
