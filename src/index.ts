import { Hono } from "hono";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

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
