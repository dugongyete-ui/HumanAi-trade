import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import signalsRouter from "./signals.js";
import marketRouter from "./market.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(signalsRouter);
router.use(marketRouter);

export default router;
