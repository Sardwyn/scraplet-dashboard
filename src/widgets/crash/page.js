// src/widgets/crash/page.js
import express from "express";

const router = express.Router();

/**
 * NOTE:
 * Dashboard configure pages for Crash are owned by routes/dashboard.js.
 * This file is intentionally NOT defining any /dashboard/* routes.
 *
 * When you add the Crash OBS/public renderer later, put routes here like:
 *   GET /obs/crash/:publicId
 *   GET /w/crash/:token
 */

export default router;
