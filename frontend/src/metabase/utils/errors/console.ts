declare global {
  interface Console {
    errorBuffer: unknown[][];
  }
}

export const MAX_ERROR_LOGS = 20;

function ignored(args: unknown[]) {
  const text = args.map((arg) => String(arg)).join(" ");
  return (
    text.includes("uses the legacy contextTypes API") ||
    text.includes("uses the legacy childContextTypes API")
  );
}

export function captureConsoleErrors() {
  console.errorBuffer = [];

  const originalError = console.error;

  console.error = function (...args: unknown[]) {
    if (ignored(args)) {
      return;
    }

    if (console.errorBuffer.length >= MAX_ERROR_LOGS) {
      console.errorBuffer.pop();
    }
    console.errorBuffer.unshift(Array.from(args));
    originalError(...args);
  };
}
