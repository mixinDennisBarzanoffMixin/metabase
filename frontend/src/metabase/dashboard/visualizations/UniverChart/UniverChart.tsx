import type { ChartSource } from "@veritly/univer-chart";
import { UniverChartView } from "@veritly/univer-chart-ui/view";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Loader, Text } from "metabase/ui";
import {
  type UniverChartRef,
  getUniverChartSource,
} from "metabase/veritly/univer";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

const settings: VisualizationDefinition = {
  getUiName: () => t`Univer chart`,
  identifier: "univerChart",
  iconName: "lineandbar",
  noun: "Univer chart",
  hidden: true,
  canSavePng: false,
  disableSettingsConfig: true,
  noHeader: false,
  minSize: { width: 3, height: 3 },
  defaultSize: { width: 6, height: 5 },
  checkRenderable: () => {},
  settings: {
    "card.title": {
      dashboard: false,
      getDefault: () => t`Univer chart`,
    },
    "card.description": {
      dashboard: false,
    },
    univerChart: {
      getDefault: () => null,
    },
  },
};

type Props = {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
  settings: VisualizationSettings;
};

type State =
  | { tag: "loading" }
  | { tag: "ready"; source: ChartSource }
  | { tag: "error"; err: string };

function plain(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function str(val: unknown, key: string) {
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

function ref(settings: VisualizationSettings): UniverChartRef {
  const val = settings.univerChart;
  if (!plain(val)) {
    throw new Error("Univer chart reference missing");
  }
  return {
    unitId: str(val.unitId, "unitId"),
    unitName: str(val.unitName, "unitName"),
    sheetId: str(val.sheetId, "sheetId"),
    sheetName: str(val.sheetName, "sheetName"),
    chartId: str(val.chartId, "chartId"),
    revision: num(val.revision, "revision"),
    name: str(val.name, "name"),
  };
}

function reason(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function ChartHost({ source }: { source: ChartSource }) {
  const [err, setErr] = useState<string>();

  useEffect(() => {
    setErr(undefined);
  }, [source]);

  const onError = useCallback(
    (error: unknown) => {
      console.error("Univer chart render failed", {
        error,
        source,
      });
      setErr(reason(error));
    },
    [source],
  );

  return (
    <Box h="100%" style={{ minHeight: 0, position: "relative" }}>
      <UniverChartView
        source={source}
        onError={onError}
        style={{ width: "100%", height: "100%" }}
      />
      {err && (
        <Box pos="absolute" inset={0} p="md">
          <Text c="error">{err}</Text>
        </Box>
      )}
    </Box>
  );
}

export function UniverChart({ settings }: Props) {
  const chart = useMemo(() => ref(settings), [settings]);
  const unitId = chart.unitId;
  const unitName = chart.unitName;
  const sheetId = chart.sheetId;
  const sheetName = chart.sheetName;
  const chartId = chart.chartId;
  const revision = chart.revision;
  const name = chart.name;
  const [state, setState] = useState<State>({ tag: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ tag: "loading" });
    getUniverChartSource(
      {
        unitId,
        unitName,
        sheetId,
        sheetName,
        chartId,
        revision,
        name,
      },
      ctrl.signal,
    )
      .then((source) => setState({ tag: "ready", source }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) {
          console.error("Univer chart source failed", err);
          setState({
            tag: "error",
            err: reason(err),
          });
        }
      });
    return () => ctrl.abort();
  }, [unitId, unitName, sheetId, sheetName, chartId, revision, name]);

  if (state.tag === "error") {
    return (
      <Box p="md">
        <Text c="error">{state.err}</Text>
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

  return (
    <Box h="100%" style={{ minHeight: 0 }}>
      <ChartHost source={state.source} />
    </Box>
  );
}

Object.assign(UniverChart, settings);
