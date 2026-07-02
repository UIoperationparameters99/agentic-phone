'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, File, Folder, ChevronRight, ChevronDown, X, Loader2, Download } from 'lucide-react';
import { useStore } from '@/lib/state/store';
import { Button } from '@/components/ui/button';
import { cn, formatBytes, isTextFile, relativeTime } from '@/lib/utils';
import type { DirEntry } from '@agentic/shared-types';

export default function FilesPage() {
  const fileTree = useStore((s) => s.fileTree);
  const currentPath = useStore((s) => s.currentPath);
  const setCurrentPath = useStore((s) => s.setCurrentPath);
  const loadDir = useStore((s) => s.loadDir);
  const session = useStore((s) => s.session);
  const filePreview = useStore((s) => s.filePreview);
  const previewFile = useStore((s) => s.previewFile);
  const closePreview = useStore((s) => s.closePreview);
  const connStatus = useStore((s) => s.connStatus);

  React.useEffect(() => {
    if (connStatus === 'connected') loadDir(currentPath);
  }, [connStatus, currentPath, loadDir]);

  const entries = fileTree[currentPath] ?? [];

  if (!session) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-sm text-muted mb-3">No active session</p>
          <Link href="/" className="text-accent text-sm underline">← Back to chat</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border safe-top">
        <Link href="/" className="p-1 text-muted hover:text-fg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold flex-1">Files</h1>
      </div>

      {/* Path breadcrumb */}
      <div className="px-3 py-2 border-b border-border bg-surface/50">
        <Breadcrumb path={currentPath} onNavigate={setCurrentPath} />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Loading…
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <FileEntry
                key={entry.path}
                entry={entry}
                onClick={() => {
                  if (entry.type === 'directory') setCurrentPath(entry.path);
                  else if (entry.isText ?? isTextFile(entry.path)) previewFile(entry.path);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* File preview modal */}
      {filePreview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface">
            <File className="h-4 w-4 text-muted" />
            <span className="text-xs font-mono truncate flex-1">{filePreview.path}</span>
            <Button size="icon-sm" variant="ghost" onClick={closePreview}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <pre className="text-xs font-mono text-fg whitespace-pre-wrap break-all">{filePreview.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split('/').filter(Boolean);
  return (
    <div className="flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap">
      <button onClick={() => onNavigate('/')} className="text-muted hover:text-fg">/</button>
      {parts.map((part, i) => {
        const sub = '/' + parts.slice(0, i + 1).join('/');
        return (
          <React.Fragment key={sub}>
            <ChevronRight className="h-3 w-3 text-muted shrink-0" />
            <button onClick={() => onNavigate(sub)} className={cn('hover:text-fg', i === parts.length - 1 ? 'text-fg font-medium' : 'text-muted')}>
              {part}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function FileEntry({ entry, onClick }: { entry: DirEntry; onClick: () => void }) {
  const Icon = entry.type === 'directory' ? Folder : File;
  return (
    <li>
      <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-2 transition-colors">
        <Icon className={cn('h-4 w-4 shrink-0', entry.type === 'directory' ? 'text-accent' : 'text-muted')} />
        <span className="text-sm truncate flex-1 text-left">{entry.name}</span>
        {entry.type === 'file' && (
          <span className="text-[10px] text-muted">{formatBytes(entry.size)}</span>
        )}
        {entry.type === 'directory' && <ChevronRight className="h-3 w-3 text-muted" />}
      </button>
    </li>
  );
}
