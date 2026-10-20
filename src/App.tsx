import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { HomePage } from "@/pages/home";

export function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
    setTheme(next);
  };

  return (
    <div className="site-shell flex min-h-screen flex-col">
      <a
        href="#poll-work"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to poll
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <a href="/" className="brand" aria-label="Sovereign cloud Debunkers home">
            <strong>Sovereign cloud</strong> <span>Debunkers</span>
          </a>
          <Button variant="outline" size="sm" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            Switch theme
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <HomePage />
      </main>
      <footer className="site-footer">
        <p>Six statements. Three possibilities. Your perspective.</p>
        <p>Anonymous audience voting. Shared results. Presenter controls require an invited Microsoft account.</p>
      </footer>
      <Toaster />
    </div>
  );
}

export default App;
