import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import signalsRouter from "./signals.js";
import marketRouter from "./market.js";
import calendarRouter from "./calendar.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(signalsRouter);
router.use(marketRouter);
router.use(calendarRouter);

export default router;
