import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toSchema(zod: any) {
  const { $schema, ...schema } = z.toJSONSchema(zod) as any;
  return schema;
}

export default fp(async function (app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'MalalyaliKada API',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
});
