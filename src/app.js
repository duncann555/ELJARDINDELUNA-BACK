import Server from "./server/config.js";

const server = new Server();

export const app = server.app;
export default server;
