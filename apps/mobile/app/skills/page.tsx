'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Sparkles, Loader2, Download, Check } from 'lucide-react';
import { useStore } from '@/lib/state/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function SkillsPage() {
  const skills = useStore((s) => s.skills);
  const loadSkills = useStore((s) => s.loadSkills);
  const installSkill = useStore((s) => s.installSkill);
  const session = useStore((s) => s.session);
  const [query, setQuery] = React.useState('');
  const [installing, setInstalling] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (session) loadSkills();
  }, [session, loadSkills]);

  const filtered = skills.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.description.toLowerCase().includes(query.toLowerCase()),
  );

  const handleInstall = async (name: string) => {
    setInstalling(name);
    try {
      await installSkill(name);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <Link href="/" className="p-1 text-muted hover:text-fg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold flex-1">Skills</h1>
        <Sparkles className="h-4 w-4 text-accent" />
      </div>

      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="pl-9 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!session ? (
          <div className="text-center text-muted text-sm py-8 px-6">
            Start a session to browse skills.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Loading skills…
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((skill) => (
              <li key={skill.name} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">@{skill.name}</span>
                      {skill.installed ? (
                        <Badge variant="success" className="gap-1 text-[10px]">
                          <Check className="h-2 w-2" />
                          installed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">available</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1 line-clamp-2">{skill.description}</p>
                    {skill.argumentHint && (
                      <p className="text-[10px] text-muted mt-1 font-mono">{skill.argumentHint}</p>
                    )}
                  </div>
                  {!skill.installed && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInstall(skill.name)}
                      disabled={installing === skill.name}
                      className="shrink-0"
                    >
                      {installing === skill.name ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      Install
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border bg-surface/50 text-[11px] text-muted text-center safe-bottom">
        Mention <code className="font-mono">@skill-name</code> in chat to invoke.
      </div>
    </div>
  );
}
