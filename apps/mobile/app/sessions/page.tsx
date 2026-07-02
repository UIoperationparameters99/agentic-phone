'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, History, Clock, MessageSquare } from 'lucide-react';
import { useStore } from '@/lib/state/store';
import { relativeTime } from '@/lib/utils';

export default function SessionsPage() {
  const sessions = useStore((s) => s.sessions);
  const loadSessions = useStore((s) => s.loadSessions);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <Link href="/" className="p-1 text-muted hover:text-fg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold flex-1">Sessions</h1>
        <History className="h-4 w-4 text-accent" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="text-center text-muted text-sm py-12 px-6">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>No past sessions yet.</p>
            <p className="text-xs mt-1">Sessions appear here after you end them.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="p-3 hover:bg-surface-2 transition-colors">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {relativeTime(s.lastActiveAt)} · created {relativeTime(s.createdAt)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
