import type { ChartRef, ChartSource } from "@veritly/chart";

import {
  getOnlyOfficeChart,
  listOnlyOfficeCharts,
  watchOnlyOfficeChart,
  watchOnlyOfficeCharts,
} from "./onlyoffice";
export type VeritlyChartRef = ChartRef & { provider: "onlyoffice" };
export type VeritlyChartSource = {
  provider: "onlyoffice";
  source: ChartSource;
};

type Provider = {
  id: string;
  list(signal?: AbortSignal): Promise<VeritlyChartRef[]>;
  get(ref: VeritlyChartRef, signal?: AbortSignal): Promise<VeritlyChartSource>;
  changes?(refresh: VoidFunction, signal: AbortSignal): Promise<void>;
  watch(
    ref: VeritlyChartRef,
    refresh: VoidFunction,
    signal: AbortSignal,
  ): Promise<void>;
};

export class ChartRegistry {
  readonly #providers = new Map<string, Provider>();

  use(provider: Provider) {
    if (this.#providers.has(provider.id)) {
      throw new Error(`Chart provider already registered: ${provider.id}`);
    }
    this.#providers.set(provider.id, provider);
    return this;
  }

  async list(signal?: AbortSignal) {
    const rows = await Promise.all(
      Array.from(this.#providers.values(), (item) =>
        item.list(signal).catch((error: unknown) => {
          if (!signal?.aborted) {
            console.error(`Chart provider ${item.id} list failed`, error);
          }
          return [];
        }),
      ),
    );
    return rows.flat().sort((a, b) => a.name.localeCompare(b.name));
  }

  async changes(refresh: VoidFunction, signal: AbortSignal) {
    await Promise.all(
      Array.from(this.#providers.values()).flatMap((item) =>
        item.changes
          ? [
              item.changes(refresh, signal).catch((error: unknown) => {
                if (!signal.aborted) {
                  console.error(
                    `Chart provider ${item.id} changes failed`,
                    error,
                  );
                }
              }),
            ]
          : [],
      ),
    );
  }

  get(ref: VeritlyChartRef, signal?: AbortSignal) {
    return this.#provider(ref).get(ref, signal);
  }

  watch(ref: VeritlyChartRef, refresh: VoidFunction, signal: AbortSignal) {
    return this.#provider(ref).watch(ref, refresh, signal);
  }

  #provider(ref: VeritlyChartRef) {
    const provider = this.#providers.get(ref.provider);
    if (!provider) {
      throw new Error(`Chart provider is not registered: ${ref.provider}`);
    }
    return provider;
  }
}

const registry = new ChartRegistry()
  .use({
    id: "onlyoffice",
    list: listOnlyOfficeCharts,
    async get(ref, signal) {
      return {
        provider: "onlyoffice",
        source: await getOnlyOfficeChart(ref, signal),
      };
    },
    changes: watchOnlyOfficeCharts,
    watch: watchOnlyOfficeChart,
  });

export const listCharts = registry.list.bind(registry);
export const getChart = registry.get.bind(registry);
export const watchCharts = registry.changes.bind(registry);
export const watchChart = registry.watch.bind(registry);
