# GitHub Profile Card Worker

Generate retro RPG-style SVG profile cards from GitHub user data.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎮 Retro RPG-style status screen design
- 🌙 Dark/Light theme support
- 🌍 Multi-language support (EN/JA)
- ⚡ Cloudflare Workers for fast global delivery
- 🔓 No authentication required (public GitHub data only)

## Usage

### SVG Card

```markdown
![GitHub Profile Card](https://card.nullvariant.com/rpg/YOUR_USERNAME)
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `theme` | Color theme (`dark`/`light`) | `dark` |
| `lang` | Language (`en`/`ja`) | `en` |

Example:
```
https://card.nullvariant.com/rpg/nullvariant?theme=light&lang=ja
```

## Self-Hosting

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Cloudflare Account](https://dash.cloudflare.com/)

### Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/nullvariant/github-profile-card-worker.git
   cd github-profile-card-worker
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run locally:
   ```bash
   pnpm dev
   ```

4. Deploy to Cloudflare Workers:
   ```bash
   pnpm deploy
   ```

### Custom Domain

Edit `wrangler.toml` to configure your custom domain:

```toml
[[routes]]
pattern = "your-domain.com/*"
zone_name = "your-domain.com"
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

[Null;Variant](https://github.com/nullvariant)
