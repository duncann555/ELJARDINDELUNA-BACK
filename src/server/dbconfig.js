import mongoose from "mongoose";

const connectionCache = globalThis.__elJardinMongoConnection || {
  connection: null,
  promise: null,
};
globalThis.__elJardinMongoConnection = connectionCache;

if (!globalThis.__elJardinMongoListenersConfigured) {
  const clearConnectionCache = () => {
    connectionCache.connection = null;
    if (mongoose.connection.readyState === 0) {
      connectionCache.promise = null;
    }
  };
  mongoose.connection.on("disconnected", clearConnectionCache);
  mongoose.connection.on("close", clearConnectionCache);
  globalThis.__elJardinMongoListenersConfigured = true;
}

export const conectarBD = async () => {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  if (!mongoUri) throw new Error("MONGODB_URI no está configurada");

  if (mongoose.connection.readyState === 1) {
    connectionCache.connection = mongoose.connection;
    return connectionCache.connection;
  }
  connectionCache.connection = null;

  if (!connectionCache.promise) {
    connectionCache.promise = mongoose
      .connect(mongoUri, {
        autoIndex: process.env.NODE_ENV !== "production",
        serverSelectionTimeoutMS: 10_000,
      })
      .then((instance) => instance.connection)
      .catch((error) => {
        connectionCache.promise = null;
        throw error;
      });
  }

  connectionCache.connection = await connectionCache.promise;
  return connectionCache.connection;
};

export default mongoose;
