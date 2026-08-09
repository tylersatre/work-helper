/**
 * Fails fast in production when a required deployment setting is missing.
 * Outside production (dev, tests), missing vars leave MCP endpoints unconfigured, as today —
 * this check does not change that.
 */
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  if (!env.MCP_TOKEN_SECRET) {
    throw new Error('MCP_TOKEN_SECRET is required in production — create .env from .env.example and set it.');
  }
  if (!env.AUTHENTIK_USERINFO_URL) {
    throw new Error('AUTHENTIK_USERINFO_URL is required in production — create .env from .env.example and set it.');
  }
}
