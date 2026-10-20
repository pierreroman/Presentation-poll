import { BarChart3 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { HomePage } from "@/pages/home";

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#poll-work"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to poll
      </a>
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex h-12 w-full max-w-[1400px] items-center gap-2 px-4">
          <BarChart3 className="size-5" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight">Live Session Poll</span>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <HomePage />
      </main>
      <Toaster />
    </div>
  );
}

export default App;
