import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { verifyToken } from './auth/tokens.js';
import { originOf, sendUnconfigured } from './http.js';
import { createMcpServer } from './tools.js';

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  app.post('/mcp', async (request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

    if (!token || !verifyToken(token, app.mcpKey)) {
      reply
        .status(401)
        .header('WWW-Authenticate', `Bearer resource_metadata="${originOf(request)}/.well-known/oauth-protected-resource"`)
        .send({});
      return;
    }

    const server = createMcpServer({ db: app.db, lanes: app.lanes, personFields: app.personFields, mailProvider: app.mailProvider });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    reply.hijack();
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  app.get('/mcp', async (_request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);
    reply.status(405).send();
  });

  app.delete('/mcp', async (_request, reply) => {
    if (!app.mcpKey) return sendUnconfigured(reply);
    reply.status(405).send();
  });
}
