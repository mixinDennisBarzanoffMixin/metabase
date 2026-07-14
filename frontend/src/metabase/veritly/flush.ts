import { useEffect, useRef } from "react";

type Kind = "dashboard" | "question" | "source";
type Save = { kind: Kind; path: string; run: () => Promise<void> };

const saves = new Map<symbol, Save>();

function route() {
  const value = `${window.location.pathname}${window.location.search}`;
  const index = value.indexOf("/veritly/");
  if (index < 0) {
    return value;
  }
  return value.slice(index);
}

async function ready(path: string) {
  const match = /^\/veritly\/(dashboard|question|source)(\/|\?|$)/.exec(path);
  const kind = match?.[1];
  if (kind !== "dashboard" && kind !== "question" && kind !== "source") {
    throw new Error(`No flush method exists for route ${path}`);
  }
  const end = Date.now() + 4_000;
  while (Date.now() < end) {
    const save = Array.from(saves.values())
      .reverse()
      .find((item) => item.kind === kind && item.path === path);
    if (save) {
      return save;
    }
    await new Promise<void>((done) => setTimeout(done, 25));
  }
  throw new Error(
    `The ${kind} editor did not register its flush method for ${path}`,
  );
}

async function flush(path: string) {
  await (await ready(path)).run();
}

export function useVeritlyFlush(kind: Kind, save: () => Promise<void>) {
  const ref = useRef(save);
  ref.current = save;
  const path = route();

  useEffect(() => {
    const id = Symbol();
    saves.set(id, { kind, path, run: () => ref.current() });
    return () => {
      saves.delete(id);
    };
  }, [kind, path]);
}

export const veritly = { flush, ready };
