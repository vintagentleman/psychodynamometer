const KEY = 'theme';

// The user's pinned scheme, or null when following the system.
export function pinnedTheme(): 'light' | 'dark' | null {
	try {
		const v = localStorage.getItem(KEY);
		return v === 'light' || v === 'dark' ? v : null;
	} catch {
		return null;
	}
}

// The scheme the pin segment represents: the pinned one, or — when following
// the system — the opposite of the current system scheme.
export function pinScheme(): 'light' | 'dark' {
	return pinnedTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
}

// Apply a pinned scheme (or null for system): toggle the root class and keep the
// `color-scheme` meta in sync (pre-paint canvas), then persist. CSS themes the
// rest; system mode carries no class and follows the OS via `@media`.
export function applyTheme(theme: 'light' | 'dark' | null) {
	const root = document.documentElement;
	root.classList.toggle('theme-light', theme === 'light');
	root.classList.toggle('theme-dark', theme === 'dark');
	document
		.querySelector('meta[name="color-scheme"]')
		?.setAttribute('content', theme ?? 'light dark');
	try {
		if (theme) localStorage.setItem(KEY, theme);
		else localStorage.removeItem(KEY);
	} catch {
		/* storage blocked — the class still themes this session */
	}
}
