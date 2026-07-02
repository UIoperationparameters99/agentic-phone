'use client';

import * as React from 'react';
import { Settings, FolderTree, Sparkles, History } from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/lib/state/store';
import { SessionBar } from './session-bar';
import { TodoPanel } from './todo-panel';
import { ChatMessageView } from './message';
import { ChatInput } from './input';

export function ChatView() {
  const messages = useStore((s) => s.messages);
  const byok = useStore((s) => s.byok);
  const byokLoaded = useStore((s) => s.byokLoaded);
  const loadByok = useStore((s) => s.loadByok);
  const session = useStore((s) => s.session);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Load BYOK config on first mount. Timeout after 5s so we don't get stuck.
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (!useStore.getState().byokLoaded) {
        console.warn('[chat] loadByok timed out after 5s, forcing byokLoaded=true');
        useStore.setState({ byokLoaded: true });
      }
    }, 5000);
    loadByok();
    return () => clearTimeout(timeout);
  }, [loadByok]);

  // Auto-scroll to bottom when messages change.
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      {/* Top bar — z.ai style: minimal, chrome wordmark */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-bg safe-top shrink-0">
        <div className="flex items-center gap-2 flex-1">
          {/* z.ai-style icon: dark rounded square with white Z */}
          <div className="w-6 h-6 rounded-md bg-surface-3 flex items-center justify-center">
            <span className="text-fg text-xs font-bold">Z</span>
          </div>
          {/* Chrome wordmark — liquid-metal gradient sweep */}
          <span className="zai-chrome-text text-sm font-semibold tracking-tight">Agentic</span>
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

      {/* Chat transcript — z.ai canvas: #0D0D0D, full-width assistant blocks */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-bg">
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
        <div className="w-10 h-10 rounded-full border-2 border-brand-dark border-t-transparent animate-spin mb-4" />
        <div className="text-sm">Loading…</div>
      </div>
    );
  }
  if (!hasByok) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        {/* z.ai-style hero: chrome wordmark + dark icon */}
        <div className="w-14 h-14 rounded-2xl bg-surface-3 flex items-center justify-center mb-5">
          <span className="text-fg text-2xl font-bold">Z</span>
        </div>
        <div className="zai-chrome-text text-xl font-semibold mb-2 tracking-tight">Agentic</div>
        <div className="text-sm text-fg-secondary mb-1">Your AI, on your phone, with its own computer.</div>
        <div className="text-xs text-muted mb-6 max-w-xs">
          Connect your LLM API key and Daytona sandbox to begin.
        </div>
        <Link href="/byok" className="px-4 py-2 rounded-btn bg-fg text-bg text-sm font-medium hover:bg-fg-secondary transition-colors">
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
          Tap <span className="text-fg font-medium">Start session</span> to spin up your AI&apos;s cloud computer.
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
