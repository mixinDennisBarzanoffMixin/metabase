/* eslint-disable no-console -- Veritly diagnostics intentionally trace every embedded iframe and export operation. */
/* eslint-disable metabase/no-literal-metabase-strings -- Stable trace labels identify the embedded Metabase process. */
import type {
  IframeChildDriver,
  IframeFlush,
  IframeInvoke,
  IframeOpen,
} from "@veritly/iframe";
import { createContext, useContext, useEffect } from "react";

type Kind = "dashboard" | "question" | "source";
type Save = {
  kind: Kind;
  path: string;
  run: () => Promise<void>;
  download?: () => Promise<Blob>;
};
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
    console.info(
      "[veritly-iframe:child]",
      "Metabase registration wait created",
      {
        path,
        kind,
      },
    );
    this.#timer = setTimeout(() => {
      console.error(
        "[veritly-iframe:child]",
        "Metabase registration wait timed out",
        { path, kind },
      );
      this.#wait.reject(
        new Error(
          `The ${kind} editor did not register its flush method for ${path}`,
        ),
      );
    }, 4_000);
  }

  resolve(save: Save) {
    console.info(
      "[veritly-iframe:child]",
      "Metabase registration wait resolved",
      {
        path: this.path,
        kind: save.kind,
        download: Boolean(save.download),
      },
    );
    clearTimeout(this.#timer);
    this.#wait.resolve(save);
  }

  reject(error: Error) {
    console.error(
      "[veritly-iframe:child]",
      "Metabase registration wait rejected",
      {
        path: this.path,
        error,
      },
    );
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
    console.info("[veritly-iframe:child]", "Metabase workspace driver created");
  }

  async open(message: IframeOpen<Payload>) {
    console.info("[veritly-iframe:child]", "Metabase driver open starting", {
      frame: message.frame,
      request: message.request,
      path: message.path,
      payload: message.payload,
      previous: this.#current?.path,
    });
    if (!message.payload || typeof message.payload.path !== "string") {
      throw new Error("Iframe payload has no path");
    }
    kind(message.payload.path);
    this.#current = message;
    console.info("[veritly-iframe:child]", "Metabase history push", {
      frame: message.frame,
      request: message.request,
      file: message.path,
      route: message.payload.path,
    });
    this.#history.push(message.payload.path);
    await this.#ready(message.payload.path);
    console.info(
      "[veritly-iframe:child]",
      "Metabase route registered and ready",
      {
        frame: message.frame,
        request: message.request,
        file: message.path,
        route: message.payload.path,
      },
    );
  }

  async flush(message: IframeFlush) {
    console.info("[veritly-iframe:child]", "Metabase driver flush starting", {
      frame: message.frame,
      request: message.request,
      path: message.path,
      active: this.#current?.path,
    });
    const current = this.#current;
    if (!current || current.path !== message.path) {
      throw new Error(`Cannot flush inactive file ${message.path}`);
    }
    await (await this.#ready(current.payload.path)).run();
    console.info("[veritly-iframe:child]", "Metabase driver flush completed", {
      frame: message.frame,
      request: message.request,
      path: message.path,
      route: current.payload.path,
    });
  }

  async invoke(message: IframeInvoke) {
    console.info("[veritly-download]", "Metabase driver invoke starting", {
      frame: message.frame,
      request: message.request,
      path: message.path,
      method: message.method,
      active: this.#current?.path,
    });
    const current = this.#current;
    if (!current || current.path !== message.path) {
      throw new Error(
        `Cannot invoke ${message.method} on inactive file ${message.path}`,
      );
    }
    if (message.method !== "download") {
      throw new Error(`Unknown iframe method ${message.method}`);
    }
    const download = (await this.#ready(current.payload.path)).download;
    if (!download) {
      throw new Error(
        `The active ${kind(current.payload.path)} cannot be downloaded`,
      );
    }
    console.info(
      "[veritly-download]",
      "Metabase registered renderer download starting",
      {
        frame: message.frame,
        request: message.request,
        path: message.path,
        route: current.payload.path,
      },
    );
    const blob = await download();
    console.info(
      "[veritly-download]",
      "Metabase registered renderer download completed",
      {
        frame: message.frame,
        request: message.request,
        path: message.path,
        route: current.payload.path,
        type: blob.type,
        size: blob.size,
      },
    );
    return blob;
  }

  register(
    type: Kind,
    path: string,
    run: () => Promise<void>,
    download?: () => Promise<Blob>,
  ) {
    const id = Symbol();
    const save = { kind: type, path, run, download };
    console.info("[veritly-iframe:child]", "Metabase route registered", {
      type,
      path,
      download: Boolean(download),
      registrations: this.#saves.size + 1,
    });
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
      console.info("[veritly-iframe:child]", "Metabase route unregistered", {
        type,
        path,
        registrations: this.#saves.size,
      });
    };
  }

  dispose() {
    console.info(
      "[veritly-iframe:child]",
      "Metabase workspace driver disposing",
      {
        registrations: this.#saves.size,
        waiting: this.#waiting.size,
        active: this.#current?.path,
      },
    );
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
      console.info(
        "[veritly-iframe:child]",
        "Metabase route already registered",
        {
          path,
          type,
          download: Boolean(save.download),
        },
      );
      return Promise.resolve(save);
    }
    console.info(
      "[veritly-iframe:child]",
      "Metabase route registration pending",
      {
        path,
        type,
        registrations: this.#saves.size,
      },
    );
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

export function useVeritlyFlush(
  type: Kind,
  save: () => Promise<void>,
  download?: () => Promise<Blob>,
) {
  const driver = useContext(VeritlyContext);
  if (!driver) {
    throw new Error("Missing Veritly iframe provider");
  }
  const path = route();

  useEffect(
    () => driver.register(type, path, save, download),
    [download, driver, path, save, type],
  );
}
