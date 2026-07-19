import type { Engine } from "metabase-types/api";

import {
  type Connector,
  DatabaseTunnelModel,
  DatabaseTunnelPolicy,
} from "./model";

const source = "019f7aa8-72a1-7c53-8c3e-88a5ff7b733d";
const connector = "019f7aa8-83c2-7a31-b032-b3d47e4cb559";
const railway = "019f7aa8-8fd1-72cc-b34c-8b20620a2c18";

const waiting = {
  id: connector,
  name: "Orders connector",
  platform: "docker",
  state: "waiting" as const,
  sessions: 0,
  sources: 1,
};

describe("DatabaseTunnelPolicy", () => {
  it("uses driver connection fields instead of hard-coded engine names", () => {
    const policy = new DatabaseTunnelPolicy();
    const postgres = {
      "driver-name": "PostgreSQL",
      "details-fields": [
        {
          type: "group",
          "container-style": ["grid", "12"],
          fields: [{ name: "veritly-tunnel-enabled", type: "string" }],
        },
      ],
    } as Engine;
    const snowflake = {
      "driver-name": "Snowflake",
      "details-fields": [{ name: "account", type: "string" }],
    } as Engine;

    expect(policy.requires(postgres)).toBe(true);
    expect(policy.requires(snowflake)).toBe(false);
  });
});

describe("DatabaseTunnelModel", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("advances automatically when the backend reports the connector online", async () => {
    jest.useFakeTimers();
    let update = (_setup: {
      source: { id: string; connector_id?: string };
      connector?: Connector;
    }) => {};
    const routes: string[] = [];
    const api = {
      list: async () => [],
      setup: async () => ({ source: { id: source } }),
      pair: async () => ({
        connector: waiting,
        pairing: "vp_pairing_code_which_is_long_enough",
        expires: Date.now() + 60_000,
        gateway: "wss://connect.veritly.co.uk/agent",
        image: "ghcr.io/veritly/connector:latest",
        railway: "https://railway.com/new/template/veritly-connector-template",
        template: "veritly-connector-template",
      }),
      route: async (id: string) => {
        routes.push(id);
        return {
          source: { id: source, connector_id: id },
          token: "vr_route_token_which_is_long_enough",
          gateway: "wss://connect.veritly.co.uk/client",
        };
      },
      projects: async () => ({
        connected: true,
        workspaces: [
          {
            id: "workspace",
            name: "Veritly",
            projects: [{ id: railway, name: "Production" }],
          },
        ],
      }),
      login: async () => "https://railway.com/oauth/authorize",
      watch: (
        watch: (setup: {
          source: { id: string; connector_id?: string };
          connector?: Connector;
        }) => void,
      ) => {
        update = watch;
        return () => {};
      },
    };
    const model = new DatabaseTunnelModel("Orders", api);

    await model.start();
    await model.deploy("docker");
    expect(model.state.view).toBe("deploy");
    expect(model.state.tunnel).toBeUndefined();
    expect(model.command()).toContain("\n  --restart unless-stopped");
    expect(model.command()).not.toContain("\n+");

    update({
      source: { id: source, connector_id: connector },
      connector: { ...waiting, state: "online", sessions: 2 },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(routes).toEqual([connector]);
    expect(model.state.tunnel).toEqual({
      "veritly-tunnel-enabled": true,
      "veritly-route": source,
      "veritly-token": "vr_route_token_which_is_long_enough",
      "veritly-gateway": "wss://connect.veritly.co.uk/client",
    });
    model.dispose();
  });

  it("retries route creation after a transient gateway failure", async () => {
    jest.useFakeTimers();
    let update = (_setup: {
      source: { id: string; connector_id?: string };
      connector?: Connector;
    }) => {};
    let attempts = 0;
    const api = {
      list: async () => [],
      setup: async () => ({ source: { id: source } }),
      pair: async () => {
        throw new Error("unused");
      },
      route: async (id: string) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Gateway is restarting");
        }
        return {
          source: { id: source, connector_id: id },
          token: "vr_route_token_which_is_long_enough",
          gateway: "wss://connect.veritly.co.uk/client",
        };
      },
      projects: async () => ({ connected: false, workspaces: [] }),
      login: async () => "https://railway.com/oauth/authorize",
      watch: (
        watch: (setup: {
          source: { id: string; connector_id?: string };
          connector?: Connector;
        }) => void,
      ) => {
        update = watch;
        return () => {};
      },
    };
    const model = new DatabaseTunnelModel("Orders", api);

    await model.start();
    update({
      source: { id: source, connector_id: connector },
      connector: { ...waiting, state: "online", sessions: 2 },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(model.state.error).toBe("Gateway is restarting");
    expect(model.state.tunnel).toBeUndefined();
    await jest.advanceTimersByTimeAsync(2_000);

    expect(attempts).toBe(2);
    expect(model.state.tunnel?.["veritly-route"]).toBe(source);
    model.dispose();
  });
});
