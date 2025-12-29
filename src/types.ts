export interface Env {
	// KV Namespace for caching (optional)
	// CACHE: KVNamespace;
}

export interface GitHubUser {
	login: string;
	name: string | null;
	bio: string | null;
	public_repos: number;
	followers: number;
	following: number;
	avatar_url: string;
	html_url: string;
	created_at: string;
}

export interface CardOptions {
	theme: "dark" | "light";
	lang: "en" | "ja";
}
