let _cloudflareEnv: Record<string, string> | null = null;

export function initEnv(env: Record<string, string>): void {
  if (!_cloudflareEnv) {
    _cloudflareEnv = env;
  }
}

export function getEnv(key: string): string | undefined {
  return _cloudflareEnv?.[key] ?? process.env[key];
}

export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`${key} env var is required`);
  }
  return value;
}
