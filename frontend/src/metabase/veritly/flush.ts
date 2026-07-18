import type {
  IframeChildDriver,
  IframeFlush,
  IframeOpen,
} from "@veritly/iframe";
import { createContext, useContext, useEffect } from "react";

type Kind = "dashboard" | "question" | "source";
type Save = { kind: Kind; path: string; run: () => Promise<void> };
type History = { push(path: string): void };
type Payload = { path: string };

class Registration {
  readonly path: string;
  readonly promise: Promise<Save>;
  readonly #wait = Promise.withResolvers<Save>();
  readonly #timer: ReturnType<typeof setTimeout>;

  constructor(path: string, kind: Kind) {
    this.path = path;
    this.promise = this.#wait.promise;
    this.#timer = setTimeout(
      () =>
        this.#wait.reject(
          new Error(
            `The ${kind} editor did not register its flush method for ${path}`,
          ),
        ),
      4_000,
    );
  }

  resolve(save: Save) {
    clearTimeout(this.#timer);
    this.#wait.resolve(save);
  }

  reject(error: Error) {
    clearTimeout(this.#timer);
    this.#wait.reject(error);
  }
}

function kind(path: string): Kind {
  const match = /^\/veritly\/(dashboard|question|source)(\/|\?|$)/.exec(path);
  const value = match?.[1];
  if (value === "dashboard" || value === "question" || value === "source") {
    return value;
  }
  throw new Error(`No flush method exists for route ${path}`);
}

function route() {
  const value = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const index = value.indexOf("/veritly/");
  if (index < 0) {
    return value;
  }
  return value.slice(index);
}

export class MetabaseWorkspaceDriver implements IframeChildDriver<Payload> {
  readonly #history: History;
  readonly #saves = new Map<symbol, Save>();
  readonly #waiting = new Map<string, Set<Registration>>();
  #current: IframeOpen<Payload> | undefined;

  constructor(history: History) {
    this.#history = history;
  }

  async open(message: IframeOpen<Payload>) {
    if (!message.payload || typeof message.payload.path !== "string") {
      throw new Error("Iframe payload has no path");
    }
    kind(message.payload.path);
    this.#current = message;
    this.#history.push(message.payload.path);
    await this.#ready(message.payload.path);
  }

  async flush(message: IframeFlush) {
    const current = this.#current;
    if (!current || current.path !== message.path) {
      throw new Error(`Cannot flush inactive file ${message.path}`);
    }
    await (await this.#ready(current.payload.path)).run();
  }

  register(type: Kind, path: string, run: () => Promise<void>) {
    const id = Symbol();
    const save = { kind: type, path, run };
    this.#saves.set(id, save);
    const waiting = this.#waiting.get(path);
    if (waiting) {
      for (const registration of waiting) {
        registration.resolve(save);
      }
      this.#waiting.delete(path);
    }
    return () => {
      this.#saves.delete(id);
    };
  }

  dispose() {
    const error = new Error("Iframe workspace was disposed");
    for (const waiting of this.#waiting.values()) {
      for (const registration of waiting) {
        registration.reject(error);
      }
    }
    this.#waiting.clear();
    this.#saves.clear();
    this.#current = undefined;
  }

  #ready(path: string) {
    const type = kind(path);
    const save = [...this.#saves.values()]
      .reverse()
      .find((item) => item.kind === type && item.path === path);
    if (save) {
      return Promise.resolve(save);
    }
    const registration = new Registration(path, type);
    const waiting = this.#waiting.get(path);
    if (waiting) {
      waiting.add(registration);
    }
    if (!waiting) {
      this.#waiting.set(path, new Set([registration]));
    }
    return registration.promise.finally(() => {
      const current = this.#waiting.get(path);
      current?.delete(registration);
      if (current?.size === 0) {
        this.#waiting.delete(path);
      }
    });
  }
}

export const VeritlyContext = createContext<MetabaseWorkspaceDriver | null>(
  null,
);

export function useVeritlyFlush(type: Kind, save: () => Promise<void>) {
  const driver = useContext(VeritlyContext);
  if (!driver) {
    throw new Error("Missing Veritly iframe provider");
  }
  const path = route();

  useEffect(
    () => driver.register(type, path, save),
    [driver, path, save, type],
  );
}
