import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LocationLike } from "../src/content/service-detector";
import type { PilgrimProfile } from "../src/types/profile";

export const FIXTURES = resolve(import.meta.dirname, "fixtures");

export function officialLocation(path = "/"): LocationLike {
  return {
    protocol: "https:",
    hostname: "ttdevasthanams.ap.gov.in",
    port: "",
    href: `https://ttdevasthanams.ap.gov.in${path}`,
    pathname: path,
    hash: "",
  };
}

export function locationFor(url: string): LocationLike {
  const u = new URL(url);
  return { protocol: u.protocol, hostname: u.hostname, port: u.port, href: u.href, pathname: u.pathname, hash: u.hash };
}

/** Loads a fixture into the jsdom document (inline scripts do not run). */
export function loadHtml(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.title = parsed.title;
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
}

export function loadFixture(name: string): void {
  loadHtml(readFileSync(resolve(FIXTURES, name), "utf8"));
}

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

export function byId<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing in fixture`);
  return el as T;
}

export interface ChromeMock {
  store: Record<string, unknown>;
  sentMessages: unknown[];
}

/** Minimal chrome.* surface used by the side panel and storage helpers. */
export function installChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};
  const sentMessages: unknown[] = [];
  const listeners = { addListener: () => undefined, removeListener: () => undefined };
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
    runtime: { id: "test-extension", onMessage: listeners, getURL: (p: string) => `chrome-extension://test-extension/${p}` },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return { store, sentMessages };
}
