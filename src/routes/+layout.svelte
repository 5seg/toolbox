<script lang="ts">
	import '#lib/styles/theme.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let { children } = $props();

	let currentTheme = $state<'light' | 'dark' | 'system'>('system');
	let mobileMenuOpen = $state(false);

	onMount(() => {
		const stored = localStorage.getItem('toolbox-theme') as 'light' | 'dark' | null;
		if (stored === 'light' || stored === 'dark') {
			currentTheme = stored;
			document.documentElement.setAttribute('data-theme', stored);
		} else {
			currentTheme = 'system';
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
		}

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleSystemThemeChange = (e: MediaQueryListEvent) => {
			if (currentTheme === 'system') {
				document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
			}
		};
		mediaQuery.addEventListener('change', handleSystemThemeChange);

		return () => {
			mediaQuery.removeEventListener('change', handleSystemThemeChange);
		};
	});

	function setTheme(theme: 'light' | 'dark' | 'system') {
		currentTheme = theme;
		if (theme === 'system') {
			localStorage.removeItem('toolbox-theme');
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
		} else {
			localStorage.setItem('toolbox-theme', theme);
			document.documentElement.setAttribute('data-theme', theme);
		}
	}

	const navItems = [
		{ label: 'トップ', href: '/' },
		{ label: '画像変換', href: '/image/convert' },
		{ label: '画像圧縮', href: '/image/compress' },
		{ label: '切り抜き', href: '/image/crop' },
		{ label: 'リサイズ', href: '/image/resize' },
		{ label: '動画変換', href: '/video/convert' },
		{ label: '疎通確認', href: '/network/ping' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="robots" content="index, follow" />
</svelte:head>

<div class="app-container">
	<header class="navbar">
		<div class="navbar-content">
			<a href="/" class="brand">
				<span class="brand-icon">⚡</span>
				<span class="brand-text">Web Toolbox</span>
			</a>

			<!-- Desktop Nav -->
			<nav class="nav-links" aria-label="メインナビゲーション">
				{#each navItems as item}
					<a
						href={item.href}
						class="nav-link"
						class:active={page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(item.href))}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<!-- Theme switcher & Mobile Toggle -->
			<div class="nav-actions">
				<div class="theme-toggle" role="group" aria-label="テーマ切替">
					<button
						type="button"
						class="theme-btn"
						class:active={currentTheme === 'light'}
						onclick={() => setTheme('light')}
						title="ライトモード"
						aria-label="ライトモード"
					>
						☀️
					</button>
					<button
						type="button"
						class="theme-btn"
						class:active={currentTheme === 'dark'}
						onclick={() => setTheme('dark')}
						title="ダークモード"
						aria-label="ダークモード"
					>
						🌙
					</button>
					<button
						type="button"
						class="theme-btn"
						class:active={currentTheme === 'system'}
						onclick={() => setTheme('system')}
						title="端末の設定に従う"
						aria-label="端末の設定に従う"
					>
						💻
					</button>
				</div>

				<button
					type="button"
					class="mobile-toggle"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					aria-expanded={mobileMenuOpen}
					aria-label="メニューを開閉"
				>
					{mobileMenuOpen ? '✕' : '☰'}
				</button>
			</div>
		</div>

		<!-- Mobile Menu -->
		{#if mobileMenuOpen}
			<nav class="mobile-nav" aria-label="モバイルナビゲーション">
				{#each navItems as item}
					<a
						href={item.href}
						class="mobile-nav-link"
						class:active={page.url.pathname === item.href}
						onclick={() => (mobileMenuOpen = false)}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		{/if}
	</header>

	<main class="main-content">
		{@render children()}
	</main>

	<footer class="footer">
		<div class="footer-content">
			<div class="footer-notice">
				<span class="privacy-badge">🔒 ローカル処理</span>
				画像・動画の処理はすべてブラウザ内(WebAssembly/Web Worker)で実行され、外部サーバーにアップロードされることはありません。
			</div>
			<div class="footer-copy">
				&copy; {new Date().getFullYear()} Web Toolbox. Cloudflare Workers ready.
			</div>
		</div>
	</footer>
</div>

<style>
	.app-container {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.navbar {
		position: sticky;
		top: 0;
		z-index: 100;
		background-color: var(--bg-card);
		border-bottom: 1px solid var(--border);
		backdrop-filter: blur(8px);
	}

	.navbar-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0.75rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text-primary);
		text-decoration: none;
	}

	.brand-icon {
		font-size: 1.3rem;
	}

	.brand-text {
		background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.nav-link {
		padding: 0.4rem 0.8rem;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 0.92rem;
		font-weight: 500;
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.nav-link:hover {
		color: var(--text-primary);
		background-color: var(--bg-muted);
		text-decoration: none;
	}

	.nav-link.active {
		color: var(--primary);
		background-color: var(--primary-light);
		font-weight: 600;
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.theme-toggle {
		display: flex;
		background-color: var(--bg-muted);
		padding: 0.2rem;
		border-radius: var(--radius-full);
		border: 1px solid var(--border);
	}

	.theme-btn {
		background: transparent;
		border: none;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-full);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
		transition: background-color var(--transition-fast);
	}

	.theme-btn:hover {
		background-color: var(--bg-card);
	}

	.theme-btn.active {
		background-color: var(--bg-card);
		box-shadow: var(--shadow-sm);
	}

	.mobile-toggle {
		display: none;
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.4rem 0.6rem;
		font-size: 1.1rem;
		color: var(--text-primary);
		cursor: pointer;
	}

	.mobile-nav {
		display: none;
		flex-direction: column;
		background-color: var(--bg-card);
		border-top: 1px solid var(--border);
		padding: 0.75rem 1.5rem;
		gap: 0.4rem;
	}

	.mobile-nav-link {
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 1rem;
	}

	.mobile-nav-link.active {
		background-color: var(--primary-light);
		color: var(--primary);
		font-weight: 600;
	}

	.main-content {
		flex: 1;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.footer {
		margin-top: auto;
		background-color: var(--bg-card);
		border-top: 1px solid var(--border);
		padding: 1.5rem;
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		text-align: center;
	}

	.footer-notice {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		line-height: 1.5;
	}

	.privacy-badge {
		background-color: var(--success-bg);
		color: var(--success);
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-full);
		font-weight: 600;
		font-size: 0.75rem;
	}

	@media (max-width: 860px) {
		.nav-links {
			display: none;
		}

		.mobile-toggle {
			display: block;
		}

		.mobile-nav {
			display: flex;
		}
	}
</style>
