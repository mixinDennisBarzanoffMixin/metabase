import type { ChartRef } from "@veritly/chart";
import type { ChartSource } from "@veritly/univer-chart";

export type UniverChartRef = ChartRef & {
  provider: "univer";
  unitId: string;
  unitName: string;
  sheetId: string;
  sheetName: string;
  chartId: string;
  revision: number;
  name: string;
};

type Body = {
  charts?: unknown;
  source?: unknown;
};

function plain(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function text(val: unknown, key: string) {
  if (typeof val === "string" && val.length > 0) {
    return val;
  }
  throw new Error(`Univer chart ${key} missing`);
}

function num(val: unknown, key: string) {
  if (typeof val === "number" && Number.isFinite(val)) {
    return val;
  }
  throw new Error(`Univer chart ${key} missing`);
}

function base() {
  const url = process.env.FRONTEND_PUBLIC_UNIVER_BACKEND_URL;
  if (typeof url === "string" && url.trim().length > 0) {
    return url.replace(/\/+$/, "");
  }
  throw new Error("FRONTEND_PUBLIC_UNIVER_BACKEND_URL is not configured");
}

function project() {
  const hit = window.location.pathname.match(/^\/project\/([^/]+)/);
  if (hit) {
    return decodeURIComponent(hit[1]);
  }
  throw new Error("Project id missing from URL");
}

async function get(path: string, signal?: AbortSignal): Promise<Body> {
  const res = await fetch(`${base()}${path}`, {
    credentials: "include",
    signal,
    headers: {
      "x-veritly-project-id": project(),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body);
  }

  const body = (await res.json()) as unknown;
  if (plain(body)) {
    return body;
  }
  throw new Error("Univer response is not an object");
}

function chart(raw: unknown): UniverChartRef {
  if (!plain(raw)) {
    throw new Error("Univer chart is not an object");
  }

  const id = text(raw.id, "id");
  const unit = text(raw.unitId, "unitId");
  const book = text(raw.unitName, "unitName");
  const sheet = text(raw.sheetId, "sheetId");
  const tab = text(raw.sheetName, "sheetName");
  const typ = num(raw.chartType, "chartType");

  return {
    provider: "univer",
    fileId: unit,
    fileName: book,
    chartId: id,
    sourceId: sheet,
    sourceName: tab,
    unitId: unit,
    unitName: book,
    sheetId: sheet,
    sheetName: tab,
    revision: num(raw.revision, "revision"),
    name: `${book} / ${tab} / Chart ${typ}`,
  };
}

export async function listUniverCharts(signal?: AbortSignal) {
  const body = await get("/universer-api/veritly/charts", signal);
  if (Array.isArray(body.charts)) {
    return body.charts.map(chart);
  }
  throw new Error("Univer charts response missing charts");
}

export async function getUniverChartSource(
  ref: UniverChartRef,
  signal?: AbortSignal,
) {
  const unit = encodeURIComponent(ref.unitId);
  const id = encodeURIComponent(ref.chartId);
  const body = await get(
    `/universer-api/veritly/units/${unit}/charts/${id}/source`,
    signal,
  );
  if (plain(body.source)) {
    return body.source as ChartSource;
  }
  throw new Error("Univer chart response missing source");
}
