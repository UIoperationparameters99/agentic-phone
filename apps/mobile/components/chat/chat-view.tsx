'use client';

import * as React from 'react';
import { Settings, FolderTree, Sparkles, History } from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/lib/state/store';
import { SessionBar } from './session-bar';
import { TodoPanel } from './todo-panel';
import { ChatMessageView } from './message';
import { ChatInput } from './input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/toaster';

export function ChatView() {
  const messages = useStore((s) => s.messages);
  const byok = useStore((s) => s.byok);
  const byokLoaded = useStore((s) => s.byokLoaded);
  const loadByok = useStore((s) => s.loadByok);
  const session = useStore((s) => s.session);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load BYOK config on first mount.
  React.useEffect(() => {
    loadByok();
  }, [loadByok]);

  // Auto-scroll to bottom when messages change.
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span className="text-sm font-semibold">Agentic</span>
        </div>
        <Link href="/files" className="p-2 text-muted hover:text-fg transition-colors" aria-label="Files">
          <FolderTree className="h-4 w-4" />
        </Link>
        <Link href="/skills" className="p-2 text-muted hover:text-fg transition-colors" aria-label="Skills">
          <Sparkles className="h-4 w-4" />
        </Link>
        <Link href="/sessions" className="p-2 text-muted hover:text-fg transition-colors" aria-label="Sessions">
          <History className="h-4 w-4" />
        </Link>
        <Link href="/byok" className="p-2 text-muted hover:text-fg transition-colors" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Link>
      </div>

      <SessionBar />

      <TodoPanel />

      {/* Chat transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState hasByok={!!byok} byokLoaded={byokLoaded} hasSession={!!session} />
        ) : (
          <div className="py-2">
            {messages.map((m) => (
              <ChatMessageView key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <ChatInput />
    </div>
  );
}

function EmptyState({ hasByok, byokLoaded, hasSession }: { hasByok: boolean; byokLoaded: boolean; hasSession: boolean }) {
  if (!byokLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center text-muted">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
        <div className="text-sm">Loading…</div>
      </div>
    );
  }
  if (!hasByok) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4">
          <Settings className="w-6 h-6 text-accent" />
        </div>
        <div className="text-base font-semibold mb-2">Welcome to Agentic</div>
        <div className="text-sm text-muted mb-6 max-w-xs">
          Connect your LLM API key and Daytona sandbox to give your AI its own computer.
        </div>
        <Link href="/byok" className="text-accent text-sm font-medium underline underline-offset-4">
          Set up keys →
        </Link>
      </div>
    );
  }
  if (!hasSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-success" />
        </div>
        <div className="text-base font-semibold mb-2">Ready when you are</div>
        <div className="text-sm text-muted mb-6 max-w-xs">
          Tap <span className="text-fg font-medium">Start session</span> to spin up your AI's cloud computer.
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center text-muted">
      <div className="text-sm">Send a message to begin…</div>
    </div>
  );
}
