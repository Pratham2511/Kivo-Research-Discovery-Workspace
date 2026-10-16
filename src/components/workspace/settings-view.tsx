"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, Settings2, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";
import { AI_PROVIDERS, validAiSettings, type AiProvider, type AiSettings } from "@/lib/ai-config";
import { aiHeaders, clearAiSettings, readAiSettings, saveAiSettings } from "@/lib/ai-browser";

export function SettingsView() {
  const [saved, setSaved] = useState<AiSettings | null>(() => readAiSettings());
  const [provider, setProvider] = useState<AiProvider>(saved?.provider ?? "google");
  const [model, setModel] = useState(saved?.model ?? AI_PROVIDERS.google.model);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function draft(requireModel = true): AiSettings {
    const settings = { provider, model: model.trim(), apiKey: apiKey.trim() || (saved?.provider === provider ? saved.apiKey : "") };
    if (!validAiSettings({ ...settings, model: requireModel ? settings.model : "catalog" })) throw new Error(requireModel ? "Enter an API key and select a model, or type its exact ID." : "Enter your provider API key first.");
    return settings;
  }
  function save(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const settings = draft(); saveAiSettings(settings); setSaved(settings); setApiKey("");
      setMessage("Saved for this browser session. All AI reading features now use these settings. Saving does not call the provider.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save settings."); }
  }
  function clear() {
    setError(""); setMessage("");
    try { clearAiSettings(); setSaved(null); setApiKey(""); setMessage("API key removed from this tab. AI is off unless the deployment has its own provider configured."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not clear settings."); }
  }
  async function testConnection() {
    setError(""); setMessage("");
    try {
      const settings = draft();
      pending.current = new AbortController(); setTesting(true);
      const response = await fetch("/api/ai/test", { method: "POST", headers: aiHeaders(settings), cache: "no-store", signal: pending.current.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Connection test failed.");
      saveAiSettings(settings); setSaved(settings); setApiKey("");
      setMessage(`Model ${body.model} generated a reply and was saved. All AI features now use this selection.`);
    } catch (e) {
      if (!pending.current?.signal.aborted) setError(e instanceof Error ? e.message : "Connection test failed.");
    } finally { setTesting(false); }
  }

  async function loadModels() {
    setError(""); setMessage("");
    try {
      const settings = draft(false);
      pending.current = new AbortController(); setLoadingModels(true);
      const response = await fetch("/api/ai/models", { method: "POST", headers: aiHeaders(settings), cache: "no-store", signal: pending.current.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load models.");
      setModels(Array.isArray(body.models) ? body.models : []);
      setMessage("Models loaded. Choose one, then test it. A listed model may still require a different quota or billing tier.");
    } catch (e) {
      if (!pending.current?.signal.aborted) setError(e instanceof Error ? e.message : "Could not load models.");
    } finally { setLoadingModels(false); }
  }
  const busy = testing || loadingModels;

  return <div className="max-w-3xl space-y-8">
    <div className="space-y-3">
      <p className="stamp-label text-[var(--cyan-ink)] flex items-center gap-2"><Settings2 size={16} /> Settings</p>
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Your AI, on your terms.</h1>
      <p className="text-[var(--ink-muted)] leading-relaxed">Connect a provider once to ask questions about papers and PDFs, and make dense abstracts easier to read.</p>
    </div>
    <section className="bench-card p-5 sm:p-8 space-y-6" aria-labelledby="ai-settings-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ai-settings-title" className="font-display text-xl font-bold flex items-center gap-2"><KeyRound size={20} className="text-[var(--cyan-ink)]" /> AI provider</h2>
        <span className="ticket">{saved ? "Key saved in this tab" : "No key saved in this tab"}</span>
      </div>
      <form onSubmit={save} className="space-y-5">
        <div className="space-y-2"><label htmlFor="ai-provider" className="block text-sm font-semibold">Provider</label>
          <select id="ai-provider" className="field-input w-full" value={provider} disabled={busy} onChange={e => { const next = e.target.value as AiProvider; setProvider(next); setModel(AI_PROVIDERS[next].model); setModels([]); setApiKey(""); setMessage(""); setError(""); }}>
            {Object.entries(AI_PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
          </select>
        </div>
        <div className="space-y-2"><label htmlFor="ai-key" className="block text-sm font-semibold">API key</label>
          <input id="ai-key" type="password" autoComplete="off" spellCheck={false} maxLength={512} className="field-input w-full" value={apiKey} disabled={busy} onChange={e => { setApiKey(e.target.value); setModels([]); setMessage(""); setError(""); }} placeholder={saved?.provider === provider ? "Key saved — enter a new key to replace it" : "Paste your provider API key"} aria-describedby="ai-key-help" />
          <p id="ai-key-help" className="text-xs text-[var(--ink-muted)]">The saved key stays hidden. <a className="text-[var(--cyan-ink)] underline inline-flex items-center gap-1" href={AI_PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">Get a {AI_PROVIDERS[provider].name} key <ExternalLink size={12} /></a></p>
        </div>
        <div className="space-y-3">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void loadModels()}>{loadingModels && <Loader2 size={15} className="animate-spin" />} {loadingModels ? "Loading models…" : "Load provider models"}</button>
          {models.length > 0 && <div className="space-y-2"><label htmlFor="ai-model-list" className="block text-sm font-semibold">Available text models</label>
            <select id="ai-model-list" className="field-input w-full" disabled={busy} value={models.includes(model) ? model : ""} onChange={e => { setModel(e.target.value); setMessage(""); setError(""); }}>
              <option value="">Choose a model</option>{models.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>}
          <label htmlFor="ai-model" className="block text-sm font-semibold">Model ID</label>
          <input id="ai-model" className="field-input w-full" value={model} disabled={busy} onChange={e => { setModel(e.target.value.replace(/^models\//, "")); setMessage(""); setError(""); }} placeholder="Load models and choose one, or enter an exact model ID" maxLength={160} required autoComplete="off" spellCheck={false} />
          <p className="text-xs text-[var(--ink-muted)]">Load the provider catalog and choose a text model. Listing a model does not guarantee free quota; Test & save checks whether it can generate for your account.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={busy}>Save settings</button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void testConnection()}>{testing && <Loader2 size={15} className="animate-spin" />} {testing ? "Testing…" : "Test & save · 1 AI request"}</button>
          {saved && <button className="btn btn-ghost" type="button" disabled={busy} onClick={clear}>Clear key</button>}
        </div>
        {message && <p role="status" className="text-sm text-[var(--cyan-ink)] leading-relaxed">{message}</p>}
        {error && <p role="alert" className="text-sm text-[var(--red-ink)] leading-relaxed">{error}</p>}
      </form>
    </section>
    <section className="bench-card p-5 sm:p-6 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><ShieldCheck size={18} className="text-[var(--cyan-ink)]" /> Private to your browser session</h2>
      <p className="text-sm text-[var(--ink-muted)] leading-relaxed">Your key is kept in this tab’s session storage, separate from papers and workspace backups. It is never saved as a deployment setting or shared with other visitors. Clear it here when finished; browsers may restore tab sessions.</p>
      <p className="text-sm text-[var(--ink-muted)] leading-relaxed">When you use AI, Kivo forwards the key and the relevant paper text securely to your selected provider. Loading models does not generate text. Test & save makes one short generation and can use provider quota. Provider usage limits and charges apply. No AI calls run in the background.</p>
    </section>
  </div>;
}
