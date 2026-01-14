import Fastify from "fastify";
import { sayHello, COMMON_CONSTANT } from "@repo/common/utils";

const fastify = Fastify({
  logger: true,
});

fastify.get("/", async (request, reply) => {
  return { hello: "world 2", common: sayHello("API"), constant: COMMON_CONSTANT };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
