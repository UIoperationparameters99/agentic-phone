'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Trash2, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/lib/state/store';
import { LLM_PROVIDERS, SANDBOX_PROVIDERS, type LlmProviderId, type SandboxProviderId, type ByokConfig } from '@agentic/shared-types';
import { useToast } from '@/components/ui/toaster';

export default function ByokPage() {
  const byok = useStore((s) => s.byok);
  const byokLoaded = useStore((s) => s.byokLoaded);
  const loadByok = useStore((s) => s.loadByok);
  const saveByok = useStore((s) => s.saveByok);
  const clearByok = useStore((s) => s.clearByok);
  const { toast } = useToast();

  // Load BYOK config on mount (in case user navigated here directly,
  // bypassing the chat view which also loads it).
  React.useEffect(() => {
    loadByok();
  }, [loadByok]);

  const [llmProvider, setLlmProvider] = React.useState<LlmProviderId>(byok?.llm.provider ?? 'openai');
  const [llmKey, setLlmKey] = React.useState(byok?.llm.apiKey ?? '');
  const [llmModel, setLlmModel] = React.useState(byok?.llm.model ?? '');
  const [llmBaseUrl, setLlmBaseUrl] = React.useState(byok?.llm.baseUrl ?? '');
  const [sandboxKey, setSandboxKey] = React.useState(byok?.sandbox.apiKey ?? '');
  const [saving, setSaving] = React.useState(false);

  // Sync local state when byok loads from storage.
  React.useEffect(() => {
    if (byok) {
      setLlmProvider(byok.llm.provider);
      setLlmKey(byok.llm.apiKey);
      setLlmModel(byok.llm.model ?? '');
      setLlmBaseUrl(byok.llm.baseUrl ?? '');
      setSandboxKey(byok.sandbox.apiKey);
    }
  }, [byok]);

  const llm = LLM_PROVIDERS[llmProvider];
  const sandbox = SANDBOX_PROVIDERS.daytona;

  const handleSave = async () => {
    if (!llmKey.trim() || !sandboxKey.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing keys',
        description: 'Both LLM API key and Daytona API key are required.',
      });
      return;
    }
    setSaving(true);
    const config: ByokConfig = {
      llm: {
        provider: llmProvider,
        apiKey: llmKey.trim(),
        model: llmModel.trim() || undefined,
        baseUrl: llmProvider === 'custom' ? llmBaseUrl.trim() : undefined,
      },
      sandbox: {
        provider: 'daytona' as SandboxProviderId,
        apiKey: sandboxKey.trim(),
      },
    };
    try {
      await saveByok(config);
      toast({
        variant: 'success',
        title: 'Keys saved',
        description: 'Stored in Android Keystore. Tap "Start session" to begin.',
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Remove all keys from this device?')) return;
    await clearByok();
    setLlmKey('');
    setSandboxKey('');
    setLlmModel('');
    setLlmBaseUrl('');
    toast({ title: 'Keys removed' });
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      {/* Header — fixed at top */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border safe-top shrink-0">
        <Link href="/" className="p-1 text-muted hover:text-fg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold flex-1">BYOK Settings</h1>
        {byok && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Configured
          </Badge>
        )}
      </div>

      {/* Scrollable content area — only this scrolls, not the page */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-3 space-y-4 max-w-md mx-auto pb-8">
        {/* LLM provider */}
        <Card>
          <CardHeader>
            <CardTitle>LLM Provider</CardTitle>
            <CardDescription>The AI model your agent will use. Bring your own key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="llm-provider">Provider</Label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {Object.values(LLM_PROVIDERS).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setLlmProvider(p.id);
                      setLlmModel('');
                      setLlmBaseUrl('');
                    }}
                    className={`px-2 py-2 rounded-md text-xs font-medium border transition-colors ${
                      llmProvider === p.id
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface-2 text-muted border-border hover:bg-border'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="llm-key">API Key</Label>
              <Input
                id="llm-key"
                type="password"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                placeholder={llm.envVar}
                className="mt-1 font-mono text-xs"
              />
              <a
                href={llm.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Get a key from {llm.label} <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div>
              <Label htmlFor="llm-model">Model (optional)</Label>
              <Input
                id="llm-model"
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder={llm.defaultModel}
                className="mt-1 font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted">Default: <code className="font-mono">{llm.defaultModel}</code></p>
            </div>

            {llmProvider === 'custom' && (
              <div>
                <Label htmlFor="llm-base">Base URL</Label>
                <Input
                  id="llm-base"
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  className="mt-1 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-muted">
                  OpenAI-compatible endpoint (no trailing slash). e.g. LM Studio, Ollama, vLLM.
                </p>
              </div>
            )}

            {llm.freeTierNote && (
              <div className="text-[11px] text-muted bg-surface-2 rounded-md p-2">
                💡 {llm.freeTierNote}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sandbox provider */}
        <Card>
          <CardHeader>
            <CardTitle>Cloud Sandbox</CardTitle>
            <CardDescription>
              The Linux computer your AI controls. Bring your own Daytona key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{sandbox.label}</span>
              <Badge variant="secondary">{sandbox.envVar}</Badge>
            </div>

            <div>
              <Label htmlFor="sandbox-key">Daytona API Key</Label>
              <Input
                id="sandbox-key"
                type="password"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={sandboxKey}
                onChange={(e) => setSandboxKey(e.target.value)}
                placeholder="dtn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="mt-1 font-mono text-xs"
              />
              <a
                href={sandbox.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Get a Daytona API key <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {sandbox.freeTierNote && (
              <div className="text-[11px] text-muted bg-surface-2 rounded-md p-2">
                💡 {sandbox.freeTierNote}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save keys
          </Button>
          {byok && (
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="text-[11px] text-muted text-center pb-4 safe-bottom">
          Keys are stored in Android Keystore (hardware-backed).<br/>
          They're passed to your sandbox as env vars on session start, wiped on session end.
        </div>
        </div>
      </div>
    </div>
  );
}
