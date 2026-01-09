import { Hono } from "hono";
import type { Env, CardOptions } from "./types";
import { fetchGitHubUser, GITHUB_USERNAME_REGEX } from "./github";
import { getCachedUser, setCachedUser } from "./cache";
import { createErrorSvg, escapeXml, FONTS, DEFAULT_FONT } from "./svg";
import { generateRpgCard } from "./templates/rpg";

const app = new Hono<{ Bindings: Env }>();

// Analytics middleware - send logs to analytics-worker
app.use("*", async (c, next) => {
	await next();

	// Send log to analytics-worker via Service Binding (non-blocking)
	const request = c.req.raw;
	const userAgent = request.headers.get("user-agent") || "";
	const referer = request.headers.get("referer") || "";
	const clientIP = request.headers.get("cf-connecting-ip") || "0.0.0.0";
	const cf = request.cf as { country?: string; city?: string; asn?: number } | undefined;

	// Check if request is from test environment (CI/E2E tests send X-Test-Environment header)
	const isTestAccess = request.headers.get("x-test-environment") === "true";

	// Send analytics (fail silently if analytics service is unavailable)
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
				isTestAccess: isTestAccess,
				asn: cf?.asn,
			}),
		}).catch(() => {
			// Analytics failure should not affect main functionality
		})
	);
});

// Health check
app.get("/", (c) => {
	return c.text("GitHub Profile Card Worker - OK");
});

// Parse size override from query parameter (returns undefined if invalid)
function parseSizeOverride(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const num = parseFloat(value);
	if (isNaN(num) || num < 0.3 || num > 2.0) return undefined;
	return num;
}

// RPG-style SVG card
app.get("/rpg/:username", async (c) => {
	const username = c.req.param("username");

	// Parse query parameters
	const themeParam = c.req.query("theme");
	const langParam = c.req.query("lang");
	const fontParam = c.req.query("font");

	// Validate font parameter
	const font = fontParam && FONTS[fontParam] ? fontParam : DEFAULT_FONT;

	// Parse size overrides (sz_title, sz_level, etc.)
	const sizeOverrides: CardOptions["sizeOverrides"] = {};
	const szTitle = parseSizeOverride(c.req.query("sz_title"));
	const szLevel = parseSizeOverride(c.req.query("sz_level"));
	const szUsername = parseSizeOverride(c.req.query("sz_username"));
	const szBio = parseSizeOverride(c.req.query("sz_bio"));
	const szStatLabel = parseSizeOverride(c.req.query("sz_stat_label"));
	const szStatValue = parseSizeOverride(c.req.query("sz_stat_value"));
	const szBarLabel = parseSizeOverride(c.req.query("sz_bar_label"));

	if (szTitle !== undefined) sizeOverrides.title = szTitle;
	if (szLevel !== undefined) sizeOverrides.level = szLevel;
	if (szUsername !== undefined) sizeOverrides.username = szUsername;
	if (szBio !== undefined) sizeOverrides.bio = szBio;
	if (szStatLabel !== undefined) sizeOverrides.statLabel = szStatLabel;
	if (szStatValue !== undefined) sizeOverrides.statValue = szStatValue;
	if (szBarLabel !== undefined) sizeOverrides.barLabel = szBarLabel;

	const options: CardOptions = {
		theme: themeParam === "light" ? "light" : "dark",
		lang: langParam === "ja" ? "ja" : "en",
		font,
		sizeOverrides: Object.keys(sizeOverrides).length > 0 ? sizeOverrides : undefined,
	};

	// Try to get from cache first
	let user = await getCachedUser(c.env.GITHUB_CACHE, username);

	if (!user) {
		// Fetch from GitHub API
		const result = await fetchGitHubUser(username);

		if (!result.success) {
			const errorSvg = createErrorSvg(result.error, options.theme);
			return new Response(errorSvg, {
				status: result.status,
				headers: {
					"Content-Type": "image/svg+xml",
					"Cache-Control": "no-cache",
				},
			});
		}

		user = result.user;

		// Cache the result (non-blocking)
		c.executionCtx.waitUntil(
			setCachedUser(c.env.GITHUB_CACHE, username, user)
		);
	}

	// Generate SVG card
	const svg = generateRpgCard(user, options);

	return c.body(svg, 200, {
		"Content-Type": "image/svg+xml",
		"Cache-Control": "public, max-age=300", // Browser cache: 5 minutes
	});
});

// Preview page (HTML)
app.get("/preview/:username", async (c) => {
	const rawUsername = c.req.param("username");
	// Validate username format
	if (!GITHUB_USERNAME_REGEX.test(rawUsername)) {
		return c.text("Invalid username format", 400);
	}
	const username = escapeXml(rawUsername);

	// Generate font options HTML
	const fontOptions = Object.entries(FONTS)
		.map(([key, config]) => {
			const selected = key === DEFAULT_FONT ? " selected" : "";
			return `<option value="${key}"${selected}>${config.name}</option>`;
		})
		.join("\n      ");

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub Profile Card - ${username}</title>
  <base href="/" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      background: #1a1a2e;
      color: #eaeaea;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    h1 { color: #00d4aa; margin-bottom: 30px; }
    .card-container { margin: 20px 0; }
    .controls {
      display: flex;
      gap: 20px;
      margin: 20px 0;
      flex-wrap: wrap;
      justify-content: center;
    }
    .control-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .control-group label {
      color: #a0a0b0;
      font-size: 12px;
    }
    .theme-switch {
      display: flex;
      gap: 10px;
    }
    .theme-switch button {
      background: #3a3a5a;
      color: #eaeaea;
      border: 2px solid #4a4a6a;
      padding: 10px 20px;
      cursor: pointer;
      font-family: inherit;
    }
    .theme-switch button:hover { background: #4a4a6a; }
    .theme-switch button.active { border-color: #00d4aa; color: #00d4aa; }
    .font-select {
      background: #3a3a5a;
      color: #eaeaea;
      border: 2px solid #4a4a6a;
      padding: 10px 15px;
      font-family: inherit;
      cursor: pointer;
    }
    .font-select:hover { background: #4a4a6a; }
    .font-select:focus { border-color: #00d4aa; outline: none; }
    .size-controls {
      background: #2a2a3e;
      border: 1px solid #4a4a6a;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      max-width: 600px;
      width: 100%;
    }
    .size-controls h3 {
      color: #00d4aa;
      margin-bottom: 15px;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .size-controls h3 button {
      background: #3a3a5a;
      color: #a0a0b0;
      border: 1px solid #4a4a6a;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
    }
    .size-controls h3 button:hover { background: #4a4a6a; color: #eaeaea; }
    .size-slider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 0;
    }
    .size-slider label {
      color: #a0a0b0;
      font-size: 11px;
      min-width: 80px;
    }
    .size-slider input[type="range"] {
      flex: 1;
      accent-color: #00d4aa;
      height: 6px;
    }
    .size-slider .value {
      color: #eaeaea;
      font-size: 11px;
      min-width: 40px;
      text-align: right;
    }
    .pixel-font-notice {
      background: #3a3a5a;
      border: 1px solid #ffaa00;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 15px;
      color: #ffaa00;
      font-size: 11px;
      display: none;
    }
    .pixel-font-notice.visible { display: block; }
    .size-controls.disabled .size-slider {
      opacity: 0.4;
      pointer-events: none;
    }
    .embed-code {
      background: #2a2a3e;
      border: 1px solid #4a4a6a;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      max-width: 600px;
      width: 100%;
    }
    .embed-code h3 { color: #00d4aa; margin-bottom: 10px; font-size: 14px; }
    .embed-code code {
      display: block;
      background: #1a1a2e;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
    }
    .copy-btn {
      background: #00d4aa;
      color: #1a1a2e;
      border: none;
      padding: 8px 16px;
      margin-top: 10px;
      cursor: pointer;
      font-family: inherit;
      font-weight: bold;
    }
    .copy-btn:hover { background: #00b89a; }
  </style>
</head>
<body>
  <h1>GitHub Profile Card</h1>

  <div class="controls">
    <div class="control-group">
      <label>Theme:</label>
      <div class="theme-switch">
        <button id="js-dark-btn" class="active" onclick="setTheme('dark')">Dark</button>
        <button id="js-light-btn" onclick="setTheme('light')">Light</button>
      </div>
    </div>
    <div class="control-group">
      <label>Font:</label>
      <select id="js-font-select" class="font-select" onchange="setFont(this.value)">
        ${fontOptions}
      </select>
    </div>
  </div>

  <div class="card-container">
    <img id="js-card-img" src="/rpg/${username}?theme=dark&font=${DEFAULT_FONT}" alt="GitHub Profile Card" />
  </div>

  <div class="size-controls" id="js-size-controls">
    <h3>
      <span>Size Adjustments</span>
      <button onclick="resetSizes()">Reset to Default</button>
    </h3>
    <div class="pixel-font-notice" id="js-pixel-notice">
      Pixel fonts (Press Start 2P, Silkscreen) only render crisply at specific sizes.
      Size adjustments may cause abrupt visual changes.
    </div>
    <div class="size-slider">
      <label>Name:</label>
      <input type="range" id="sz-title" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('title', this.value)">
      <span class="value" id="sz-title-val">1.0</span>
    </div>
    <div class="size-slider">
      <label>Level:</label>
      <input type="range" id="sz-level" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('level', this.value)">
      <span class="value" id="sz-level-val">1.0</span>
    </div>
    <div class="size-slider">
      <label>Username:</label>
      <input type="range" id="sz-username" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('username', this.value)">
      <span class="value" id="sz-username-val">1.0</span>
    </div>
    <div class="size-slider">
      <label>Bio:</label>
      <input type="range" id="sz-bio" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('bio', this.value)">
      <span class="value" id="sz-bio-val">1.0</span>
    </div>
    <div class="size-slider">
      <label>Stat Labels:</label>
      <input type="range" id="sz-stat-label" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('stat_label', this.value)">
      <span class="value" id="sz-stat-label-val">1.0</span>
    </div>
    <div class="size-slider">
      <label>Stat Values:</label>
      <input type="range" id="sz-stat-value" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('stat_value', this.value)">
      <span class="value" id="sz-stat-value-val">1.0</span>
    </div>
    <div class="size-slider">
      <label>Bar Labels:</label>
      <input type="range" id="sz-bar-label" min="0.3" max="2.0" step="0.05" value="1.0" oninput="updateSize('bar_label', this.value)">
      <span class="value" id="sz-bar-label-val">1.0</span>
    </div>
  </div>

  <div class="embed-code">
    <h3>Markdown (for README)</h3>
    <code id="js-md-code"></code>
    <button class="copy-btn" onclick="copyCode('js-md-code')">Copy</button>
  </div>

  <div class="embed-code">
    <h3>HTML</h3>
    <code id="js-html-code"></code>
    <button class="copy-btn" onclick="copyCode('js-html-code')">Copy</button>
  </div>

  <script>
    const username = '${username}';
    let currentTheme = 'dark';
    let currentFont = '${DEFAULT_FONT}';
    const sizeOverrides = {
      title: 1.0,
      level: 1.0,
      username: 1.0,
      bio: 1.0,
      stat_label: 1.0,
      stat_value: 1.0,
      bar_label: 1.0
    };

    // Pixel fonts that don't scale smoothly
    const pixelFonts = ['press-start-2p', 'silkscreen'];
    let debounceTimer = null;

    function updateCardImmediate() {
      const params = new URLSearchParams();
      params.set('theme', currentTheme);
      if (currentFont !== '${DEFAULT_FONT}') {
        params.set('font', currentFont);
      }
      // Add size overrides if not default
      Object.entries(sizeOverrides).forEach(([key, value]) => {
        if (value !== 1.0) {
          params.set('sz_' + key, value.toFixed(2));
        }
      });
      document.getElementById('js-card-img').src = '/rpg/' + username + '?' + params.toString();
      updateEmbedCodes();
    }

    // Debounced updateCard (300ms delay for sliders)
    function updateCard() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateCardImmediate, 300);
    }

    // Immediate update for theme/font changes
    function updateCardNow() {
      if (debounceTimer) clearTimeout(debounceTimer);
      updateCardImmediate();
    }

    function updatePixelFontNotice() {
      const isPixel = pixelFonts.includes(currentFont);
      document.getElementById('js-pixel-notice').classList.toggle('visible', isPixel);
    }

    function updateEmbedCodes() {
      const params = new URLSearchParams();
      if (currentTheme !== 'dark') params.set('theme', currentTheme);
      if (currentFont !== '${DEFAULT_FONT}') params.set('font', currentFont);
      // Add size overrides if not default
      Object.entries(sizeOverrides).forEach(([key, value]) => {
        if (value !== 1.0) {
          params.set('sz_' + key, value.toFixed(2));
        }
      });
      const queryString = params.toString();
      const urlSuffix = queryString ? '?' + queryString : '';
      const baseUrl = window.location.origin + '/rpg/' + username;
      document.getElementById('js-md-code').textContent = '![GitHub Profile Card](' + baseUrl + urlSuffix + ')';
      document.getElementById('js-html-code').textContent = '<img src="' + baseUrl + urlSuffix + '" alt="GitHub Profile Card" />';
    }

    function setTheme(theme) {
      currentTheme = theme;
      document.getElementById('js-dark-btn').classList.toggle('active', theme === 'dark');
      document.getElementById('js-light-btn').classList.toggle('active', theme === 'light');
      updateCardNow();
    }

    function setFont(font) {
      currentFont = font;
      updatePixelFontNotice();
      updateCardNow();
    }

    function updateSize(key, value) {
      const numValue = parseFloat(value);
      sizeOverrides[key] = numValue;
      document.getElementById('sz-' + key.replace('_', '-') + '-val').textContent = numValue.toFixed(2);
      updateCard();
    }

    function resetSizes() {
      const defaults = ['title', 'level', 'username', 'bio', 'stat_label', 'stat_value', 'bar_label'];
      defaults.forEach(key => {
        sizeOverrides[key] = 1.0;
        const sliderId = 'sz-' + key.replace('_', '-');
        document.getElementById(sliderId).value = '1.0';
        document.getElementById(sliderId + '-val').textContent = '1.00';
      });
      updateCardNow();
    }

    function copyCode(id) {
      const code = document.getElementById(id).textContent;
      navigator.clipboard.writeText(code).then(() => {
        alert('Copied to clipboard!');
      });
    }

    // Initialize
    updateEmbedCodes();
    updatePixelFontNotice();
  </script>
</body>
</html>`;

	return c.html(html);
});

export default app;
