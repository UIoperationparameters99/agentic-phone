'use client';

import * as React from 'react';
import { ArrowUp, Square, Paperclip, AtSign } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/state/store';

export function ChatInput() {
  const [text, setText] = React.useState('');
  const isRunning = useStore((s) => s.isRunning);
  const sendPrompt = useStore((s) => s.sendPrompt);
  const cancelRun = useStore((s) => s.cancelRun);
  const connStatus = useStore((s) => s.connStatus);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!text.trim()) return;
    if (connStatus !== 'connected') {
      alert('Not connected to sandbox. Start a session first.');
      return;
    }
    sendPrompt(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter to send on mobile (no Shift needed — Shift+Enter for newline is desktop convention,
    // but mobile keyboards don't have Shift in the same way).
    // We use a custom approach: tap send button. Enter creates newline.
  };

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="border-t border-border bg-bg p-2 safe-bottom">
      <div className="flex items-end gap-2">
        <Button variant="ghost" size="icon" className="shrink-0 text-muted" disabled>
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="shrink-0 text-muted" disabled>
          <AtSign className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={connStatus === 'connected' ? 'Message Agentic…' : 'Start a session first…'}
          disabled={connStatus !== 'connected'}
          rows={1}
          className="flex-1 min-h-[40px] max-h-40 resize-none text-sm"
        />
        {isRunning ? (
          <Button variant="destructive" size="icon" onClick={cancelRun} className="shrink-0">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="icon" onClick={handleSubmit} disabled={!text.trim() || connStatus !== 'connected'} className="shrink-0">
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
