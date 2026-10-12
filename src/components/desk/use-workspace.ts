"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { emptyWorkspace, validateEvidence, type Workspace } from "@/lib/workspace/schema";
import { BrowserWorkspaceRepository, normalizeWorkspace } from "@/lib/workspace/repository";
import { localCache } from "@/lib/workspace/storage-engine";
import { persistWorkspace } from "@/lib/workspace/persistence";

export type StorageStatus = "local" | "memory";

/** IndexedDB is authoritative; localStorage is a small-workspace fallback.
 * The server relay does not persist research and is deliberately not called.
 */
export function useWorkspace() {
  const [state, setState] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("local");
  const [error, setError] = useState("");
  const stateRef = useRef(state);
  const readyRef = useRef(false);
  const repository = useRef(new BrowserWorkspaceRepository());
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      let stored: Workspace | null = null;
      try {
        stored = await repository.current.load();
      } catch {
        // A blocked/private browser may still allow the localStorage fallback.
        await Promise.resolve();
      }
      if (cancelled || readyRef.current) return;
      const next = stored ?? localCache.loadSync();
      stateRef.current = next;
      setState(next);
      if (!stored) {
        const result = await persistWorkspace(next, repository.current, localCache);
        if (cancelled) return;
        setStorageStatus(result.durable ? "local" : "memory");
        setError(result.error);
      }
      readyRef.current = true;
      setReady(true);
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  const mutate = useCallback((change: (draft: Workspace) => void): Promise<boolean> => {
    const run = async () => {
      if (!readyRef.current) return false;
      setSaving(true);
      try {
        const draft = structuredClone(stateRef.current);
        change(draft);
        const next = normalizeWorkspace(draft);
        const invalid = validateEvidence(next);
        if (invalid) throw new Error(invalid);
        const result = await persistWorkspace(next, repository.current, localCache);
        // Keep work available for backup even when both browser stores fail.
        stateRef.current = next;
        setState(next);
        setStorageStatus(result.durable ? "local" : "memory");
        setError(result.error);
        return result.durable;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Your change could not be saved. Try again.");
        return false;
      } finally {
        setSaving(false);
      }
    };
    // Rapid captures/toggles cannot race the asynchronous IndexedDB writes.
    const pending = writeQueue.current.then(run, run);
    writeQueue.current = pending;
    return pending;
  }, []);

  return { state, mutate, ready, saving, storageStatus, error };
}
