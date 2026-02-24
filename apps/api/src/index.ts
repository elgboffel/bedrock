import { COMMON_CONSTANT, sayHello } from "@repo/common/utils";
import Fastify from "fastify";

const fastify = Fastify({
  logger: true,
});

fastify.get("/", async (_request, _reply) => {
  return {
    hello: "world 2",
    common: sayHello("API"),
    constant: COMMON_CONSTANT,
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: "0.0.0.0" });

    const listeners = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const signal of listeners) {
      process.on(signal, async () => {
        fastify.log.info(`[${signal}] received, shutting down cleanly...`);
        console.log("Nodemon triggered rebuild test...");
        await fastify.close();
        process.exit(0);
      });
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
