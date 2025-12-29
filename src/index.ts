import { Hono } from "hono";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Analytics middleware - send logs to analytics-worker
app.use("*", async (c, next) => {
	await next();

	// Send log to analytics-worker via Service Binding (non-blocking)
	const request = c.req.raw;
	const userAgent = request.headers.get("user-agent") || "";
	const referer = request.headers.get("referer") || "";
	const clientIP = request.headers.get("cf-connecting-ip") || "0.0.0.0";
	const cf = request.cf as { country?: string; city?: string } | undefined;

	c.executionCtx.waitUntil(
		c.env.ANALYTICS.fetch("https://analytics/log", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				service: "card",
				path: c.req.path,
				ip: clientIP,
				country: cf?.country || "XX",
				city: cf?.city || "Unknown",
				userAgent: userAgent,
				referer: referer,
			}),
		})
	);
});

// Health check
app.get("/", (c) => {
	return c.text("GitHub Profile Card Worker - OK");
});

// RPG-style SVG card
app.get("/rpg/:username", async (c) => {
	const username = c.req.param("username");
	// TODO: Implement RPG template
	return c.text(`RPG card for ${username} - Coming soon`, 501);
});

// Preview page
app.get("/preview/:username", async (c) => {
	const username = c.req.param("username");
	// TODO: Implement preview HTML
	return c.text(`Preview for ${username} - Coming soon`, 501);
});

export default app;
