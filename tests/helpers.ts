import type { PilgrimProfile } from "../src/types/profile";

/** Clearly synthetic test identities — never real pilgrim data. */
export function makeProfile(overrides: Partial<PilgrimProfile> = {}): PilgrimProfile {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    label: "Test One",
    fullName: "TEST PILGRIM ONE",
    age: 40,
    gender: "Male",
    photoIdType: "Aadhaar Card",
    photoIdNumber: "000011112222",
    updatedAt: new Date().toISOString(),
    ageLastConfirmedAt: new Date().toISOString(),
    ...overrides,
  };
}

type RuntimeListener = (msg: unknown, sender: chrome.runtime.MessageSender) => void;

export interface ChromeMock {
  store: Record<string, unknown>;
  sentMessages: unknown[];
  /** Delivers a message to the side panel as if a content script sent it. */
  emitRuntimeMessage: (msg: unknown, sender: chrome.runtime.MessageSender) => void;
}

/** Minimal chrome.* surface used by the side panel and storage helpers. */
export function installChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};
  const sentMessages: unknown[] = [];
  const listeners = { addListener: () => undefined, removeListener: () => undefined };
  const runtimeListeners = new Set<RuntimeListener>();
  const onMessage = {
    addListener: (fn: RuntimeListener) => void runtimeListeners.add(fn),
    removeListener: (fn: RuntimeListener) => void runtimeListeners.delete(fn),
  };
  const mock = {
    storage: {
      local: {
        get: async (key: string | string[]) => {
          const keys = Array.isArray(key) ? key : [key];
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = structuredClone(store[k]);
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store[k] = structuredClone(v);
        },
        remove: async (key: string | string[]) => {
          const keys = Array.isArray(key) ? key : [key];
          for (const k of keys) Reflect.deleteProperty(store, k);
        },
        clear: async () => {
          for (const k of Object.keys(store)) Reflect.deleteProperty(store, k);
        },
      },
    },
    tabs: {
      query: async () => [],
      sendMessage: async (_id: number, msg: unknown) => {
        sentMessages.push(msg);
        return undefined;
      },
      onActivated: listeners,
      onUpdated: listeners,
    },
    runtime: { id: "test-extension", onMessage, getURL: (p: string) => `chrome-extension://test-extension/${p}` },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return {
    store,
    sentMessages,
    emitRuntimeMessage: (msg, sender) => runtimeListeners.forEach((fn) => fn(msg, sender)),
  };
}
