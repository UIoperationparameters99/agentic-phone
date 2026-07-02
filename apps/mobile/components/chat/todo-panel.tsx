'use client';

import * as React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';
import { useStore } from '@/lib/state/store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export function TodoPanel() {
  const todos = useStore((s) => s.todos);
  if (todos.length === 0) return null;

  return (
    <div className="border-b border-border bg-surface/50 p-3">
      <div className="text-[10px] uppercase font-semibold text-muted mb-2 tracking-wide">Plan</div>
      <ScrollArea className="max-h-40">
        <ul className="space-y-1.5">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-start gap-2 text-xs">
              {todo.status === 'completed' ? (
                <Check className="h-3 w-3 text-success shrink-0 mt-0.5" />
              ) : todo.status === 'in_progress' ? (
                <Loader2 className="h-3 w-3 text-accent shrink-0 mt-0.5 animate-spin" />
              ) : (
                <Circle className="h-3 w-3 text-muted shrink-0 mt-0.5" />
              )}
              <span className={cn(
                'flex-1',
                todo.status === 'completed' && 'line-through text-muted',
                todo.status === 'in_progress' && 'text-fg font-medium',
                todo.status === 'pending' && 'text-muted',
              )}>
                {todo.content}
              </span>
              {todo.priority === 'high' && todo.status !== 'completed' && (
                <span className="text-[9px] uppercase text-error font-bold">high</span>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
