export function newId(prefix = ''): string {
  const c = globalThis.crypto as Crypto | undefined;
  const id =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${id}` : id;
}

export function nowStamp(): string {
  return new Date().toISOString();
}
