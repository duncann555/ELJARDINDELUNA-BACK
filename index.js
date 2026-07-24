import server from "./src/app.js";
import { conectarBD } from "./src/server/dbconfig.js";
import validateRuntimeEnv from "./src/server/validateEnv.js";

const start = async () => {
  try {
    validateRuntimeEnv();
    await conectarBD();
    server.listen();
  } catch (error) {
    console.error("[startup]", error.message);
    process.exitCode = 1;
  }
};

if (process.env.NODE_ENV !== "test") {
  start();
}

export default server.app;
