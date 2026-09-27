"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { emptyWorkspace, type Workspace } from "@/lib/workspace/schema";
import { mergeWorkspace, normalizeWorkspace } from "@/lib/workspace/repository";
import { localCache } from "@/lib/workspace/storage-engine";

export type StorageStatus =
  | "local"
  | "synced"
  | "memory";

/**
 * Browser-first workspace state.
 *
 * The working set (saved papers, projects, evidence, compare tray, search
 * history, alerts, inbox) lives authoritatively in localStorage; the server
 * is an optional relay. The initial render always starts from an empty
 * workspace so server HTML and first client paint match exactly — the real
 * state is hydrated in an effect immediately after mount.
 */
export function useWorkspace() {
  const [state, setState] = useState<Workspace>(() => emptyWorkspace());

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("local");
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Hydrate from localStorage on client mount & check optional remote sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    const cached = localCache.loadSync();
    setState(cached);
    stateRef.current = cached;
    setReady(true);

    // Optional background sync with backend if available
    const tryRemoteSync = async () => {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (response.ok) {
          const body = await response.json();
          if (body && body.state) {
            // Local-first merge: the browser's working set is authoritative;
            // the relay contributes additions but can never delete locally
            // captured work (papers, evidence, claims) in a stale snapshot.
            const remoteState = normalizeWorkspace(body.state);
            const merged = mergeWorkspace(cached, remoteState);
            setState(merged);
            stateRef.current = merged;
            localCache.saveSync(merged);
            setStorageStatus("synced");
          }
        } else {
          setStorageStatus("local");
        }
      } catch {
        // Backend relay is offline - continue smoothly in pure local mode
        setStorageStatus("local");
      }
    };

    void tryRemoteSync();
  }, []);

  // Mutate function: synchronous local write + background sync
  const mutate = useCallback(
    async (change: (draft: Workspace) => void): Promise<boolean> => {
      setSaving(true);
      try {
        const current = structuredClone(stateRef.current);
        change(current);
        const next = normalizeWorkspace(current);

        // 1. Instant synchronous write to localStorage
        localCache.saveSync(next);

        // 2. Immediate UI state update
        setState(next);
        stateRef.current = next;

        // 3. Non-blocking background sync
        void fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: next, revision: Date.now() }),
        })
          .then((res) => {
            if (res.ok) setStorageStatus("synced");
            else setStorageStatus("local");
          })
          .catch(() => {
            setStorageStatus("local");
          });

        return true;
      } catch (err) {
        console.error("Mutation failed", err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return {
    state,
    mutate,
    ready,
    saving,
    storageStatus,
    error: "",
    reload: async () => {},
  };
}
