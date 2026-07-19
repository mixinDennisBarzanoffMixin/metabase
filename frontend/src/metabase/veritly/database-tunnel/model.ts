import { BehaviorSubject } from "rxjs";
import { z } from "zod";

import type { Engine } from "metabase-types/api";

const Text = z.string().trim().min(1);
const State = z.enum([
  "waiting",
  "online",
  "degraded",
  "offline",
  "unreachable",
  "revoked",
]);
const Connector = z.object({
  id: z.uuid(),
  name: Text,
  platform: Text,
  state: State,
  sessions: z.number().int().nonnegative(),
  sources: z.number().int().nonnegative(),
});
const Source = z.object({
  id: z.uuid(),
  connector_id: z.uuid().optional(),
});
const Setup = z.object({ source: Source, connector: Connector.optional() });
const List = z.object({ connectors: z.array(Connector) });
const Pair = z.object({
  connector: Connector,
  pairing: Text,
  expires: z.number().int().positive(),
  gateway: z.url(),
  image: Text,
  template: Text,
});
const Route = z.object({
  source: Source,
  token: Text,
  gateway: z.url(),
});
const Projects = z.object({
  connected: z.boolean(),
  account: z
    .object({ sub: Text, email: z.email().optional(), name: Text.optional() })
    .optional(),
  workspaces: z.array(
    z.object({
      id: Text,
      name: Text,
      projects: z.array(
        z.object({
          id: z.uuid(),
          name: Text,
          environments: z.array(z.object({ id: z.uuid(), name: Text })),
        }),
      ),
    }),
  ),
});
const Login = z.object({ url: z.url() });
const Deployment = z.object({
  projectId: z.uuid(),
  workflowId: Text.nullable(),
});
const Failure = z.object({ error: Text });
const Context = z.object({ api: z.url(), source: z.uuid() });

type Connector = z.infer<typeof Connector>;
type Setup = z.infer<typeof Setup>;
type Platform = "railway" | "docker";
type Environment = { id: string; name: string };
type Project = {
  id: string;
  name: string;
  workspace: string;
  environments: readonly Environment[];
};
type Tunnel = {
  "veritly-tunnel-enabled": true;
  "veritly-route": string;
  "veritly-token": string;
  "veritly-gateway": string;
};
type View = "loading" | "existing" | "technology" | "deploy";

type TunnelState = {
  view: View;
  connectors: readonly Connector[];
  selected: string;
  platform?: Platform;
  pairing: string;
  gateway: string;
  image: string;
  template: string;
  expires?: number;
  projects: readonly Project[];
  project: string;
  environment: string;
  railwayConnected: boolean;
  railwayAccount?: string;
  deployed: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  tunnel?: Tunnel;
};

type Watch = (setup: Setup) => void;
type Port = {
  list(): Promise<readonly Connector[]>;
  setup(): Promise<Setup>;
  pair(platform: Platform, name: string): Promise<z.infer<typeof Pair>>;
  route(connector: string): Promise<z.infer<typeof Route>>;
  projects(): Promise<z.infer<typeof Projects>>;
  login(): Promise<string>;
  provision(input: {
    connector: string;
    pairing: string;
    project: string;
    environment: string;
  }): Promise<z.infer<typeof Deployment>>;
  watch(watch: Watch): () => void;
};

export class DatabaseTunnelContext {
  static current() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return Context.parse({
      api: hash.get("veritlyApi"),
      source: hash.get("veritlySource"),
    });
  }
}

export class DatabaseTunnelPolicy {
  requires(engine: Engine | undefined) {
    if (!engine?.["details-fields"]) {
      return false;
    }
    const fields = [...engine["details-fields"]];
    while (fields.length > 0) {
      const field = fields.shift();
      if (!field) {
        continue;
      }
      if (field.type === "group") {
        fields.push(...field.fields);
        continue;
      }
      if (field.name === "veritly-tunnel-enabled") {
        return true;
      }
    }
    return false;
  }
}

class DatabaseTunnelGateway implements Port {
  constructor(
    private readonly cfg: z.infer<typeof Context>,
    private readonly request: typeof fetch = fetch.bind(globalThis),
    private readonly events: typeof EventSource = EventSource,
  ) {}

  async list() {
    return List.parse(await this.send("/connector")).connectors;
  }

  async setup() {
    return Setup.parse(
      await this.send(
        `/connector/source/${encodeURIComponent(this.cfg.source)}`,
      ),
    );
  }

  async pair(platform: Platform, name: string) {
    return Pair.parse(
      await this.send("/connector/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: this.cfg.source, name, platform }),
      }),
    );
  }

  async route(connector: string) {
    return Route.parse(
      await this.send(
        `/connector/source/${encodeURIComponent(this.cfg.source)}/route`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connector }),
        },
      ),
    );
  }

  async projects() {
    return Projects.parse(await this.send("/connector/railway/projects"));
  }

  async login() {
    return Login.parse(
      await this.send("/connector/railway/login", { method: "POST" }),
    ).url;
  }

  async provision(input: {
    connector: string;
    pairing: string;
    project: string;
    environment: string;
  }) {
    return Deployment.parse(
      await this.send("/connector/railway/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  }

  watch(watch: Watch) {
    const events = new this.events(
      this.url(
        `/connector/source/${encodeURIComponent(this.cfg.source)}/events`,
      ),
      { withCredentials: true },
    );
    events.onmessage = (event) => {
      void new Response(event.data).json().then(
        (data: unknown) => {
          const setup = Setup.safeParse(data);
          if (setup.success) {
            watch(setup.data);
          }
        },
        () => undefined,
      );
    };
    return () => events.close();
  }

  private async send(path: string, init?: RequestInit) {
    const res = await this.request(this.url(path), {
      credentials: "include",
      ...init,
    });
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const failure = Failure.safeParse(data);
      throw new Error(
        failure.success
          ? failure.data.error
          : `Connector request failed: ${res.status}`,
      );
    }
    return data;
  }

  private url(path: string) {
    return `${this.cfg.api.replace(/\/+$/, "")}${path}`;
  }
}

export class DatabaseTunnelModel {
  readonly #state = new BehaviorSubject<TunnelState>({
    view: "loading",
    connectors: [],
    selected: "",
    pairing: "",
    gateway: "",
    image: "",
    template: "",
    projects: [],
    project: "",
    environment: "",
    railwayConnected: false,
    deployed: false,
    loading: true,
    busy: false,
    error: "",
  });
  #stop?: () => void;
  #popup?: Window;
  #timer?: ReturnType<typeof setInterval>;
  #retry?: ReturnType<typeof setTimeout>;
  #routing = false;
  #closed = false;

  constructor(
    private readonly name: string,
    private readonly api: Port = new DatabaseTunnelGateway(
      DatabaseTunnelContext.current(),
    ),
  ) {}

  get state() {
    return this.#state.value;
  }

  get connector() {
    return this.state.connectors.find(
      (item) => item.id === this.state.selected,
    );
  }

  subscribe(watch: (state: TunnelState) => void) {
    const sub = this.#state.subscribe(watch);
    return () => sub.unsubscribe();
  }

  async start() {
    const loaded = await Promise.all([this.api.list(), this.api.setup()]).then(
      ([connectors, setup]) => ({ connectors, setup }),
      (cause: unknown) => {
        this.#fail(cause);
        return undefined;
      },
    );
    if (!loaded) {
      this.#later(() => void this.start());
      return;
    }
    this.#apply(loaded.setup, loaded.connectors, true);
    this.#stop = this.api.watch((setup) => this.#apply(setup));
  }

  async choose(connector: Connector) {
    this.#set({ selected: connector.id, error: "" });
    await this.#connect(connector);
  }

  install() {
    this.#set({ view: "technology", error: "" });
  }

  back() {
    if (this.state.view === "deploy") {
      this.#set({ view: "technology", error: "" });
      return;
    }
    const existing = this.state.connectors.some((item) => this.#live(item));
    this.#set({ view: existing ? "existing" : "technology", error: "" });
  }

  async deploy(platform: Platform) {
    this.#set({ busy: true, error: "", platform });
    const paired = await this.api.pair(platform, `${this.name} connector`).then(
      (value) => value,
      (cause: unknown) => {
        this.#fail(cause);
        return undefined;
      },
    );
    if (!paired) {
      return;
    }
    this.#set({
      view: "deploy",
      selected: paired.connector.id,
      pairing: paired.pairing,
      gateway: paired.gateway,
      image: paired.image,
      template: paired.template,
      expires: paired.expires,
      deployed: false,
      connectors: [
        ...this.state.connectors.filter(
          (item) => item.id !== paired.connector.id,
        ),
        paired.connector,
      ],
      busy: false,
    });
    if (platform === "railway") {
      await this.loadRailway();
    }
  }

  async loadRailway() {
    const result = await this.api.projects().then(
      (value) => value,
      (cause: unknown) => {
        this.#fail(cause);
        return undefined;
      },
    );
    if (!result) {
      return;
    }
    const projects = result.workspaces.flatMap((workspace) =>
      workspace.projects.map((project) => ({
        ...project,
        workspace: workspace.name,
      })),
    );
    const project = projects.some((item) => item.id === this.state.project)
      ? this.state.project
      : "";
    const selected = projects.find((item) => item.id === project);
    const environment = selected?.environments.some(
      (item) => item.id === this.state.environment,
    )
      ? this.state.environment
      : selected?.environments.length === 1
        ? selected.environments[0].id
        : "";
    this.#set({
      railwayConnected: result.connected,
      railwayAccount: result.account?.email || result.account?.name,
      projects,
      project,
      environment,
      busy: false,
    });
  }

  async login() {
    this.#set({ busy: true, error: "" });
    const url = await this.api.login().then(
      (value) => value,
      (cause: unknown) => {
        this.#fail(cause);
        return undefined;
      },
    );
    if (!url) {
      return;
    }
    const popup = window.open(
      url,
      "veritly-railway",
      "popup,width=720,height=800",
    );
    if (!popup) {
      this.#set({
        busy: false,
        error: "Railway sign-in was blocked by the browser.",
      });
      return;
    }
    this.#popup = popup;
    this.#timer = setInterval(() => {
      if (!this.#popup?.closed) {
        return;
      }
      this.#stopPopup();
      void this.loadRailway();
    }, 500);
  }

  select(project: string) {
    const selected = this.state.projects.find((item) => item.id === project);
    if (!selected) {
      this.#set({ error: "Choose a Railway project." });
      return;
    }
    this.#set({
      project,
      environment:
        selected.environments.length === 1 ? selected.environments[0].id : "",
      error: "",
    });
  }

  selectEnvironment(environment: string) {
    const project = this.state.projects.find(
      (item) => item.id === this.state.project,
    );
    if (!project?.environments.some((item) => item.id === environment)) {
      this.#set({ error: "Choose a Railway environment." });
      return;
    }
    this.#set({ environment, error: "" });
  }

  async provision() {
    if (
      !this.state.selected ||
      !this.state.pairing ||
      !this.state.project ||
      !this.state.environment
    ) {
      this.#set({ error: "Choose a Railway project and environment." });
      return;
    }
    this.#set({ busy: true, error: "" });
    const deployed = await this.api
      .provision({
        connector: this.state.selected,
        pairing: this.state.pairing,
        project: this.state.project,
        environment: this.state.environment,
      })
      .then(
        () => true,
        (cause: unknown) => {
          this.#fail(cause);
          return false;
        },
      );
    if (!deployed) {
      return;
    }
    this.#set({ busy: false, deployed: true });
  }

  command() {
    if (this.state.platform === "railway") {
      return `railway deploy -t ${this.state.template} \\
  -v 'VERITLY_GATEWAY_URL=${this.state.gateway}' \\
  -v 'VERITLY_PAIRING_CODE=${this.state.pairing}' \\
  -v 'VERITLY_STATUS_ADDR=:8081' \\
  -v 'PORT=8081'`;
    }
    return `docker pull ${this.state.image}
docker volume create veritly-connector-state
docker run -d --name veritly-connector \\
  --restart unless-stopped \\
  --user 65532:65532 \\
  --network <database-network> \\
  --read-only --cap-drop ALL \\
  -v veritly-connector-state:/var/lib/veritly \\
  -e VERITLY_GATEWAY_URL='${this.state.gateway}' \\
  -e VERITLY_PAIRING_CODE='${this.state.pairing}' \\
  ${this.state.image} agent`;
  }

  dispose() {
    this.#closed = true;
    this.#stop?.();
    this.#stop = undefined;
    if (this.#retry) {
      clearTimeout(this.#retry);
    }
    this.#retry = undefined;
    this.#stopPopup();
    this.#state.complete();
  }

  #apply(
    setup: Setup,
    connectors: readonly Connector[] = this.state.connectors,
    initial = false,
  ) {
    const connector = setup.connector;
    const next = connector
      ? [...connectors.filter((item) => item.id !== connector.id), connector]
      : connectors;
    const selected = connector ? connector.id : this.state.selected;
    const live = connector ? this.#live(connector) : false;
    this.#set({
      connectors: next,
      selected,
      loading: false,
      ...(initial
        ? {
            view: live
              ? "loading"
              : next.some((item) => this.#live(item))
                ? "existing"
                : "technology",
          }
        : {}),
    });
    if (live && connector) {
      void this.#connect(connector);
    }
  }

  async #connect(connector: Connector) {
    if (this.#routing || this.state.tunnel || !this.#live(connector)) {
      return;
    }
    this.#routing = true;
    this.#set({ view: "loading", busy: true, error: "" });
    const route = await this.api.route(connector.id).then(
      (value) => value,
      (cause: unknown) => {
        this.#fail(cause);
        return undefined;
      },
    );
    this.#routing = false;
    if (!route) {
      this.#set({ view: this.state.pairing ? "deploy" : "existing" });
      this.#later(() => {
        const current = this.state.connectors.find(
          (item) => item.id === connector.id,
        );
        if (current) {
          void this.#connect(current);
        }
      });
      return;
    }
    if (this.#retry) {
      clearTimeout(this.#retry);
    }
    this.#retry = undefined;
    this.#set({
      busy: false,
      tunnel: {
        "veritly-tunnel-enabled": true,
        "veritly-route": route.source.id,
        "veritly-token": route.token,
        "veritly-gateway": route.gateway,
      },
    });
  }

  #live(connector: Connector) {
    return !["waiting", "offline", "revoked"].includes(connector.state);
  }

  #fail(cause: unknown) {
    this.#set({
      loading: false,
      busy: false,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  #stopPopup() {
    if (this.#timer) {
      clearInterval(this.#timer);
    }
    this.#timer = undefined;
    this.#popup = undefined;
  }

  #later(run: () => void) {
    if (this.#retry) {
      clearTimeout(this.#retry);
    }
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      run();
    }, 2_000);
  }

  #set(next: Partial<TunnelState>) {
    if (this.#closed) {
      return;
    }
    this.#state.next({ ...this.state, ...next });
  }
}

export type { Connector, Tunnel, TunnelState };
