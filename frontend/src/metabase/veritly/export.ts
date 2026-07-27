export async function settle(ready: () => boolean, label: string, ms: number) {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() >= end) {
      throw new Error(`${label} did not finish rendering within ${ms}ms`);
    }
    await new Promise<void>((done) => setTimeout(done, 25));
  }
  const wait = Promise.withResolvers<void>();
  const timer = setTimeout(() => wait.resolve(), 2_000);
  await Promise.race([document.fonts.ready, wait.promise]);
  clearTimeout(timer);
  const paint = Promise.withResolvers<void>();
  const frame = requestAnimationFrame(() => paint.resolve());
  const delay = setTimeout(() => paint.resolve(), 100);
  await paint.promise;
  cancelAnimationFrame(frame);
  clearTimeout(delay);
}
