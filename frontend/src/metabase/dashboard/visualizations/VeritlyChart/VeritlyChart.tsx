import type { ChartRef } from "@veritly/chart";
import { ChartView } from "@veritly/chart-ui/view";
import { UniverChartView } from "@veritly/univer-chart-ui/view";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Loader, Text } from "metabase/ui";
import {
  type VeritlyChartRef,
  type VeritlyChartSource,
  getChart,
  watchChart,
} from "metabase/veritly/charts";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

const definition: VisualizationDefinition = {
  getUiName: () => t`Live chart`,
  identifier: "veritlyChart",
  iconName: "lineandbar",
  noun: "Live chart",
  hidden: true,
  canSavePng: false,
  disableSettingsConfig: true,
  noHeader: false,
  minSize: { width: 3, height: 3 },
  defaultSize: { width: 6, height: 5 },
  checkRenderable: () => {},
  settings: {
    "card.title": { dashboard: false, getDefault: () => t`Live chart` },
    "card.description": { dashboard: false },
    veritlyChart: { getDefault: () => null },
  },
};

type Props = {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
  settings: VisualizationSettings;
};

type State =
  | { tag: "loading" }
  | { tag: "ready"; source: VeritlyChartSource }
  | { tag: "error"; error: string };

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, key: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Live chart ${key} missing`);
}

function num(value: unknown, key: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Live chart ${key} missing`);
}

function ref(settings: VisualizationSettings): VeritlyChartRef {
  const raw = settings.veritlyChart;
  if (!plain(raw)) {
    throw new Error("Live chart reference missing");
  }
  const base: ChartRef = {
    provider: text(raw.provider, "provider"),
    fileId: text(raw.fileId, "fileId"),
    fileName: text(raw.fileName, "fileName"),
    chartId: text(raw.chartId, "chartId"),
    sourceId: text(raw.sourceId, "sourceId"),
    sourceName: text(raw.sourceName, "sourceName"),
    revision: num(raw.revision, "revision"),
    name: text(raw.name, "name"),
  };
  if (base.provider === "onlyoffice") {
    return base;
  }
  if (base.provider !== "univer") {
    throw new Error(`Live chart provider is unsupported: ${base.provider}`);
  }
  return {
    ...base,
    provider: "univer",
    unitId: text(raw.unitId, "unitId"),
    unitName: text(raw.unitName, "unitName"),
    sheetId: text(raw.sheetId, "sheetId"),
    sheetName: text(raw.sheetName, "sheetName"),
  };
}

function reason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function View({ source }: { source: VeritlyChartSource }) {
  const [error, setError] = useState<string>();
  const fail = useCallback((value: unknown) => setError(reason(value)), []);
  useEffect(() => setError(undefined), [source]);
  return (
    <Box h="100%" style={{ minHeight: 0, position: "relative" }}>
      {source.provider === "onlyoffice" ? (
        <ChartView
          spec={source.source.spec}
          onError={fail}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <UniverChartView
          source={source.source}
          onError={fail}
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {error && (
        <Box pos="absolute" inset={0} p="md">
          <Text c="error">{error}</Text>
        </Box>
      )}
    </Box>
  );
}

export function VeritlyChart({ settings }: Props) {
  const chart = useMemo(() => ref(settings), [settings]);
  const [state, setState] = useState<State>({ tag: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      getChart(chart, ctrl.signal).then(
        (source) => setState({ tag: "ready", source }),
        (error: unknown) => {
          if (!ctrl.signal.aborted) {
            setState({ tag: "error", error: reason(error) });
          }
        },
      );
    setState({ tag: "loading" });
    void load();
    void watchChart(chart, () => void load(), ctrl.signal);
    return () => ctrl.abort();
  }, [chart]);

  if (state.tag === "error") {
    return (
      <Box p="md">
        <Text c="error">{state.error}</Text>
      </Box>
    );
  }
  if (state.tag !== "ready") {
    return (
      <Box
        h="100%"
        display="flex"
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <Loader size="sm" />
      </Box>
    );
  }
  return <View source={state.source} />;
}

Object.assign(VeritlyChart, definition);
