import type { ChartRef, ChartSource } from "@veritly/chart";

type Body = { charts?: unknown; source?: unknown };

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, key: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`ONLYOFFICE chart ${key} missing`);
}

function num(value: unknown, key: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`ONLYOFFICE chart ${key} missing`);
}

function base() {
  const url = process.env.FRONTEND_PUBLIC_ONLYOFFICE_BACKEND_URL;
  if (typeof url === "string" && url.trim().length > 0) {
    return url.replace(/\/+$/, "");
  }
  throw new Error("FRONTEND_PUBLIC_ONLYOFFICE_BACKEND_URL is not configured");
}

function project() {
  const hit = window.location.pathname.match(/^\/project\/([^/]+)/);
  if (hit) {
    return decodeURIComponent(hit[1]);
  }
  throw new Error("Project id missing from URL");
}

function headers() {
  return { "x-veritly-project-id": project() };
}

async function get(path: string, signal?: AbortSignal): Promise<Body> {
  const res = await fetch(`${base()}/onlyoffice-api${path}`, {
    credentials: "include",
    signal,
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const body = (await res.json()) as unknown;
  if (plain(body)) {
    return body;
  }
  throw new Error("ONLYOFFICE response is not an object");
}

function ref(raw: unknown): ChartRef {
  if (!plain(raw) || raw.provider !== "onlyoffice") {
    throw new Error("ONLYOFFICE chart is not an object");
  }
  const file = text(raw.fileName, "fileName");
  const source = text(raw.sourceName, "sourceName");
  const name = text(raw.name, "name");
  return {
    provider: "onlyoffice",
    fileId: text(raw.fileId, "fileId"),
    fileName: file,
    chartId: text(raw.chartId, "chartId"),
    sourceId: text(raw.sourceId, "sourceId"),
    sourceName: source,
    revision: num(raw.revision, "revision"),
    name: `${file} / ${source} / ${name}`,
  };
}

export async function listOnlyOfficeCharts(signal?: AbortSignal) {
  const body = await get("/charts", signal);
  if (!Array.isArray(body.charts)) {
    throw new Error("ONLYOFFICE charts response missing charts");
  }
  return body.charts.map(ref);
}

export async function getOnlyOfficeChart(ref: ChartRef, signal?: AbortSignal) {
  const body = await get(
    `/files/${encodeURIComponent(ref.fileId)}/charts/${encodeURIComponent(ref.chartId)}`,
    signal,
  );
  if (!plain(body.source)) {
    throw new Error("ONLYOFFICE chart response missing source");
  }
  const item = refFromSource(body.source);
  if (!plain(body.source.spec) || body.source.spec.version !== 1) {
    throw new Error("ONLYOFFICE chart source is malformed");
  }
  const spec = body.source.spec;
  if (
    typeof spec.kind !== "string" ||
    typeof spec.title !== "string" ||
    !plain(spec.option)
  ) {
    throw new Error("ONLYOFFICE chart spec is malformed");
  }
  return {
    ...item,
    spec: {
      version: 1,
      kind: spec.kind,
      title: spec.title,
      option: spec.option,
    },
    updated: num(body.source.updated, "updated"),
  } as ChartSource;
}

function refFromSource(raw: Record<string, unknown>) {
  return ref(raw);
}

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 1_000);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function stream(
  path: string,
  refresh: VoidFunction,
  signal: AbortSignal,
) {
  const res = await fetch(`${base()}/onlyoffice-api${path}`, {
    credentials: "include",
    signal,
    headers: headers(),
  });
  if (!res.ok || !res.body) {
    throw new Error(await res.text());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const item = await reader.read();
    if (item.done) {
      throw new Error("ONLYOFFICE chart event stream closed");
    }
    buffer += decoder.decode(item.value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    if (
      frames.some((frame) => {
        const lines = frame.split(/\r?\n/);
        return lines.includes("event: ready") || lines.includes("event: chart");
      })
    ) {
      refresh();
    }
  }
}

async function watch(path: string, refresh: VoidFunction, signal: AbortSignal) {
  while (!signal.aborted) {
    await stream(path, refresh, signal).catch(async (error: unknown) => {
      if (signal.aborted) {
        return;
      }
      console.error("ONLYOFFICE chart event stream failed", error);
      await delay(signal);
    });
  }
}

export function watchOnlyOfficeCharts(
  refresh: VoidFunction,
  signal: AbortSignal,
) {
  return watch("/charts/events", refresh, signal);
}

export function watchOnlyOfficeChart(
  ref: ChartRef,
  refresh: VoidFunction,
  signal: AbortSignal,
) {
  return watch(
    `/files/${encodeURIComponent(ref.fileId)}/charts/events`,
    refresh,
    signal,
  );
}
