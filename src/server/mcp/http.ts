import type { FastifyReply, FastifyRequest } from 'fastify';

export function originOf(request: FastifyRequest): string {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? request.headers.host ?? request.hostname;
  return `${request.protocol}://${host}`;
}

export function sendUnconfigured(reply: FastifyReply): void {
  reply.status(503).send({ error: { message: 'The MCP connector is not configured (no CONNECTOR_PASSWORD set)' } });
}
