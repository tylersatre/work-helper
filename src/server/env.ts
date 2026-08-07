/**
 * Fails fast in production when a required deployment setting is missing.
 * Outside production (dev, tests), a missing CONNECTOR_PASSWORD leaves MCP endpoints
 * unconfigured, as today — this check does not change that.
 */
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  if (!env.CONNECTOR_PASSWORD) {
    throw new Error('CONNECTOR_PASSWORD is required in production — create .env from .env.example and set it.');
  }
}
