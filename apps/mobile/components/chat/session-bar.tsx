'use client';

import * as React from 'react';
import { Play, Pause, Square, Loader2, WifiOff, Wifi, AlertCircle } from 'lucide-react';
import { useStore } from '@/lib/state/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function SessionBar() {
  const session = useStore((s) => s.session);
  const connStatus = useStore((s) => s.connStatus);
  const spawnSession = useStore((s) => s.spawnSession);
  const pauseSession = useStore((s) => s.pauseSession);
  const resumeSession = useStore((s) => s.resumeSession);
  const destroySession = useStore((s) => s.destroySession);
  const byok = useStore((s) => s.byok);
  const [busy, setBusy] = React.useState(false);

  const handleAction = async (action: 'spawn' | 'pause' | 'resume' | 'destroy') => {
    setBusy(true);
    try {
      if (action === 'spawn') await spawnSession();
      else if (action === 'pause') await pauseSession();
      else if (action === 'resume') await resumeSession();
      else if (action === 'destroy') await destroySession();
    } catch (e) {
      console.error('[session]', e);
      alert(`Session error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg">
      <ConnectionBadge status={connStatus} />

      <div className="flex-1" />

      {!session && (
        <Button size="sm" onClick={() => handleAction('spawn')} disabled={busy || !byok}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Start session
        </Button>
      )}
      {session?.status === 'running' && (
        <>
          <Button size="sm" variant="outline" onClick={() => handleAction('pause')} disabled={busy}>
            <Pause className="h-3 w-3" />
            Pause
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleAction('destroy')} disabled={busy}>
            <Square className="h-3 w-3" />
          </Button>
        </>
      )}
      {session?.status === 'paused' && (
        <>
          <Button size="sm" onClick={() => handleAction('resume')} disabled={busy}>
            <Play className="h-3 w-3" />
            Resume
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleAction('destroy')} disabled={busy}>
            <Square className="h-3 w-3" />
          </Button>
        </>
      )}
    </div>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  if (status === 'connected') {
    return (
      <Badge variant="success" className="gap-1">
        <Wifi className="h-2.5 w-2.5" />
        Connected
      </Badge>
    );
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        {status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-2.5 w-2.5" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <WifiOff className="h-2.5 w-2.5" />
      Offline
    </Badge>
  );
}
