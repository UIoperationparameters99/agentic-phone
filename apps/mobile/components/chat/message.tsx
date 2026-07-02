'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Brain, User } from 'lucide-react';
import type { ChatMessage } from '@/lib/agent/event-renderer';
import { ToolCallCard } from './tool-call-card';
import { Badge } from '@/components/ui/badge';
import { cn, formatTokens, formatCost } from '@/lib/utils';

interface Props {
  message: ChatMessage;
}

export function ChatMessageView({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex gap-2 px-3 py-2 animate-fade-in">
        <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5 text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted mb-0.5">You</div>
          <div className="text-sm text-fg whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 px-3 py-2 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
        <Brain className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted mb-0.5">Agentic</div>

        {/* Reasoning tokens (collapsible) */}
        {message.reasoning && (
          <details className="mb-2 rounded-md bg-surface-2 p-2 text-xs text-muted">
            <summary className="cursor-pointer select-none">Thinking…</summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{message.reasoning}</pre>
          </details>
        )}

        {/* Tool calls */}
        {message.toolCalls.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} />
        ))}

        {/* Text content */}
        {message.content && (
          <div className="prose prose-sm max-w-none text-sm text-fg">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Loading indicator */}
        {!message.content && !message.reasoning && message.toolCalls.length === 0 && !message.isError && !message.finishedAt && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-accent rounded-full animate-pulse" />
              <span className="w-1 h-1 bg-accent rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-accent rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Usage + cost */}
        {message.usage && (
          <div className="flex gap-2 mt-2">
            <Badge variant="secondary" className="text-[10px]">
              {formatTokens(message.usage.input)} in / {formatTokens(message.usage.output)} out
            </Badge>
            {message.usage.costUsd !== undefined && (
              <Badge variant="outline" className="text-[10px]">{formatCost(message.usage.costUsd)}</Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
