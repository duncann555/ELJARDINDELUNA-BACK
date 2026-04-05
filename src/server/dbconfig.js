import mongoose from "mongoose";

const globalConnection = globalThis;

if (!globalConnection.__elJardinDeLunaMongo) {
  globalConnection.__elJardinDeLunaMongo = {
    connection: null,
    promise: null,
  };
}

const cache = globalConnection.__elJardinDeLunaMongo;

export const conectarBD = async () => {
  try {
    if (!process.env.MONGODB) {
      throw new Error("La variable de entorno MONGODB no esta definida");
    }

    if (cache.connection || mongoose.connection.readyState === 1) {
      cache.connection = mongoose.connection;
      return cache.connection;
    }

    if (!cache.promise) {
      cache.promise = mongoose
        .connect(process.env.MONGODB, {
          serverSelectionTimeoutMS: 10000,
        })
        .then((mongooseInstance) => {
          console.info("BD CONECTADA CORRECTAMENTE");
          return mongooseInstance.connection;
        });
    }

    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    cache.connection = null;
    console.error("ERROR CRITICO DE CONEXION A MONGODB:");
    console.error(error.message);
    throw error;
  }
};

export default mongoose;
