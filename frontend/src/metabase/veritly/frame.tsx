import { useEffect, useRef } from "react";

import { useHistory } from "metabase/history";

import { veritly } from "./flush";

type Open = {
  type: "veritly.iframe.open";
  frame: string;
  request: number;
  path: string;
  payload: { path: string };
};

type Flush = {
  type: "veritly.iframe.flush";
  frame: string;
  request: number;
  path: string;
};

function open(value: unknown): value is Open {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const data = value as Record<string, unknown>;
  const payload = data.payload;
  return (
    data.type === "veritly.iframe.open" &&
    typeof data.frame === "string" &&
    typeof data.request === "number" &&
    typeof data.path === "string" &&
    typeof payload === "object" &&
    payload !== null &&
    typeof Reflect.get(payload, "path") === "string" &&
    /^\/veritly\/(source|dashboard|question)(\/|\?|$)/.test(
      Reflect.get(payload, "path"),
    )
  );
}

function flush(value: unknown): value is Flush {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    Reflect.get(value, "type") === "veritly.iframe.flush" &&
    typeof Reflect.get(value, "frame") === "string" &&
    typeof Reflect.get(value, "request") === "number" &&
    typeof Reflect.get(value, "path") === "string"
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function VeritlyFrame() {
  const { history } = useHistory();
  const active = useRef<Open>();

  useEffect(() => {
    const url = new URL(window.location.href);
    const origin = url.searchParams.get("parentOrigin")?.trim();
    const frame = url.searchParams.get("frame")?.trim();
    if (!origin || !frame || window.parent === window) {
      return;
    }

    const receive = async (event: MessageEvent) => {
      if (event.source !== window.parent) {
        return;
      }
      if (event.origin !== origin) {
        console.error(
          new Error(`Rejected iframe parent origin ${event.origin}`),
        );
        return;
      }
      if (open(event.data)) {
        if (event.data.frame !== frame) {
          console.error(new Error("Received an open for another iframe"));
          return;
        }
        active.current = event.data;
        history.push(event.data.payload.path);
        const request = event.data;
        veritly.ready(request.payload.path).then(
          () => {
            if (active.current?.request !== request.request) {
              return;
            }
            window.parent.postMessage(
              {
                type: "veritly.iframe.loaded",
                frame,
                request: request.request,
                path: request.path,
              },
              origin,
            );
          },
          (error) => {
            if (active.current?.request !== request.request) {
              return;
            }
            window.parent.postMessage(
              {
                type: "veritly.iframe.error",
                frame,
                request: request.request,
                error: message(error),
              },
              origin,
            );
          },
        );
        return;
      }
      if (!flush(event.data)) {
        console.error(new Error("Received a malformed iframe request"));
        return;
      }
      const error =
        event.data.frame !== frame
          ? new Error("Received a flush for another iframe")
          : event.data.path !== active.current?.path
            ? new Error(`Cannot flush inactive file ${event.data.path}`)
            : undefined;
      if (error) {
        window.parent.postMessage(
          {
            type: "veritly.iframe.error",
            frame,
            request: event.data.request,
            error: error.message,
          },
          origin,
        );
        return;
      }
      veritly.flush(active.current.payload.path).then(
        () =>
          window.parent.postMessage(
            {
              type: "veritly.iframe.flushed",
              frame,
              request: event.data.request,
              path: event.data.path,
            },
            origin,
          ),
        (error) =>
          window.parent.postMessage(
            {
              type: "veritly.iframe.error",
              frame,
              request: event.data.request,
              error: message(error),
            },
            origin,
          ),
      );
    };

    window.addEventListener("message", receive);
    window.parent.postMessage(
      {
        type: "veritly.iframe.ready",
        frame,
        methods: ["open", "flush"],
        events: ["loaded"],
      },
      origin,
    );
    return () => window.removeEventListener("message", receive);
  }, [history]);

  return null;
}

export function VeritlyWorkspace() {
  return null;
}
