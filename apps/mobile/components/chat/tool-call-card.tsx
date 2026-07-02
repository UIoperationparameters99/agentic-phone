'use client';

import * as React from 'react';
import { ChevronRight, ChevronDown, Loader2, CheckCircle2, XCircle, Terminal, FileText, Search, ListTree, GitBranch, ListChecks } from 'lucide-react';
import type { ToolCallState } from '@/lib/agent/event-renderer';
import { cn, prettyJson, truncate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const TOOL_ICONS: Record<string, React.ElementType> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  MultiEdit: FileText,
  Grep: Search,
  Glob: Search,
  LS: ListTree,
  TodoWrite: ListChecks,
  TodoRead: ListChecks,
  Skill: GitBranch,
};

interface Props {
  toolCall: ToolCallState;
}

export function ToolCallCard({ toolCall }: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const Icon = TOOL_ICONS[toolCall.toolName] ?? Terminal;

  return (
    <div className="my-2 rounded-md border border-border bg-surface-2 overflow-hidden animate-fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-border/30 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted shrink-0" />}
        <Icon className="h-3.5 w-3.5 text-muted shrink-0" />
        <span className="text-xs font-mono font-medium text-fg shrink-0">{toolCall.toolName}</span>
        <span className="text-xs text-muted truncate flex-1">{summarize(toolCall)}</span>
        <StatusBadge status={toolCall.status} />
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2 bg-black/30">
          <div>
            <div className="text-[10px] uppercase text-muted font-semibold mb-1">Args</div>
            <pre className="text-xs font-mono text-fg whitespace-pre-wrap break-all">{prettyJson(toolCall.args)}</pre>
          </div>
          {(toolCall.partialOutput || toolCall.finalOutput !== undefined) && (
            <div>
              <div className="text-[10px] uppercase text-muted font-semibold mb-1">Output</div>
              <pre className="text-xs font-mono text-fg whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
                {toolCall.finalOutput !== undefined
                  ? truncate(prettyJson(toolCall.finalOutput), 4000)
                  : toolCall.partialOutput}
              </pre>
            </div>
          )}
          {toolCall.durationMs !== undefined && (
            <div className="text-[10px] text-muted">{(toolCall.durationMs / 1000).toFixed(2)}s</div>
          )}
        </div>
      )}
    </div>
  );
}

function summarize(tc: ToolCallState): string {
  const a = tc.args as Record<string, unknown> | undefined;
  if (!a) return '';
  switch (tc.toolName) {
    case 'Bash': return String(a.command ?? '').slice(0, 80);
    case 'Read': return String(a.filepath ?? '');
    case 'Write': return String(a.filepath ?? '');
    case 'Edit': return String(a.filepath ?? '');
    case 'MultiEdit': return String(a.filepath ?? '');
    case 'Grep': return String(a.pattern ?? '');
    case 'Glob': return String(a.pattern ?? '');
    case 'LS': return String(a.path ?? '');
    case 'TodoWrite': return `${(a.todos as any[])?.length ?? 0} items`;
    case 'Skill': return `@${a.command}`;
    default: return prettyJson(a).slice(0, 80);
  }
}

function StatusBadge({ status }: { status: ToolCallState['status'] }) {
  if (status === 'running') {
    return (
      <Badge variant="outline" className="text-accent border-accent/30 gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        running
      </Badge>
    );
  }
  if (status === 'done') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-2.5 w-2.5" />
        done
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-2.5 w-2.5" />
      error
    </Badge>
  );
}
