import { Router } from "express";
import productosRoutes from "./productos.routes.js";
import usuariosRoutes from "./usuarios.routes.js";
import pedidosRoutes from "./pedidos.routes.js";
import pagosRoutes from "./pagos.routes.js";
import enviosRoutes from "./envios.routes.js";

const router = Router();

router.use("/productos", productosRoutes);
router.use("/usuarios", usuariosRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/pagos", pagosRoutes);
router.use("/envios", enviosRoutes);

export default router;
