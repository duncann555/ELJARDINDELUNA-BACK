import { Router } from "express";
import adminRoutes from "./admin.routes.js";
import checkoutRoutes from "./checkout.routes.js";
import pagosRoutes from "./pagos.routes.js";
import pedidosRoutes from "./pedidos.routes.js";
import productosRoutes from "./productos.routes.js";

const router = Router();

router.use("/productos", productosRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/pagos", pagosRoutes);
router.use("/admin", adminRoutes);

export default router;
