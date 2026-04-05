import server from "./src/app.js";
import { conectarBD } from "./src/server/dbconfig.js";
import { validateRuntimeEnv } from "./src/server/validateEnv.js";

const iniciarServidor = async () => {
  try {
    validateRuntimeEnv();
    await conectarBD();
    server.listen();
  } catch (error) {
    console.error("[startup] No se pudo iniciar el servidor:", error.message);
    process.exit(1);
  }
};

if (!process.env.VERCEL) {
  iniciarServidor();
}

export default server.app;
