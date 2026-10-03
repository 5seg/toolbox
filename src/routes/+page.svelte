<script lang="ts">
	let searchQuery = $state('');
	let selectedCategory = $state<'all' | 'image' | 'video' | 'network'>('all');

	const tools = [
		{
			id: 'image-convert',
			title: '画像変換',
			description: 'PNG, JPG, WebP, AVIF などの画像を任意形式へ一括変換。高品質な WebAssembly コーデックを使用。',
			category: 'image',
			href: '/image/convert',
			icon: '🔄',
			tags: ['WebAssembly', 'Web Worker', '一括変換', 'ロスレス/非可逆']
		},
		{
			id: 'image-compress',
			title: '画像圧縮',
			description: 'Squoosh相当の高圧縮・高品質画像オプティマイザ。スライダーで画質を調整しながらファイルサイズと画質を即座に比較。',
			category: 'image',
			href: '/image/compress',
			icon: '🗜️',
			tags: ['Squoosh相当', 'WebP/AVIF', '前後比較', 'サイズ削減']
		},
		{
			id: 'image-crop',
			title: '画像切り抜き',
			description: 'Canvasによる直感的なトリミングツール。1:1, 16:9, 4:3, 9:16 などのアスペクト比プリセットや自由変形に対応。',
			category: 'image',
			href: '/image/crop',
			icon: '✂️',
			tags: ['アスペクト比固定', '回転・反転', '直感トリミング']
		},
		{
			id: 'image-resize',
			title: '画像リサイズ',
			description: '幅・高さのピクセル指定やパーセント比率指定で画像サイズを変更。比率固定トグルや標準プリセット完備。',
			category: 'image',
			href: '/image/resize',
			icon: '📐',
			tags: ['比率固定', 'パーセント指定', '高品質補間']
		},
		{
			id: 'video-convert',
			title: '動画変換',
			description: 'ffmpeg.wasm (単一スレッド版) による動画フォーマット変換と音声抽出。MP4, WebM, GIF, MP3 に対応。',
			category: 'video',
			href: '/video/convert',
			icon: '🎬',
			tags: ['ffmpeg.wasm', 'COOP不要', '進捗表示', '音声抽出']
		},
		{
			id: 'network-ping',
			title: 'サーバー疎通確認',
			description: 'Cloudflare Workers エッジからの HTTP(S) 往復時間 (RTT ping代替) および TCP ポート疎通確認。',
			category: 'network',
			href: '/network/ping',
			icon: '🌐',
			tags: ['Workers API', 'TCP確認', 'RTT測定', '安全設計']
		}
	];

	const filteredTools = $derived(
		tools.filter((t) => {
			const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
			const query = searchQuery.trim().toLowerCase();
			const matchesQuery =
				query === '' ||
				t.title.toLowerCase().includes(query) ||
				t.description.toLowerCase().includes(query) ||
				t.tags.some((tag) => tag.toLowerCase().includes(query));
			return matchesCategory && matchesQuery;
		})
	);
</script>

<svelte:head>
	<title>Webツールボックス | ブラウザ完結の高機能便利ツール集</title>
</svelte:head>

<div class="hero">
	<div class="hero-badge">⚡ 高速・プライバシー保護・ブラウザ完結</div>
	<h1 class="hero-title">日常を便利にするWebツールボックス</h1>
	<p class="hero-sub">
		画像・動画変換からネットワーク検証まで、すべてブラウザとエッジで動作。ファイルが外部サーバーに保存される心配はありません。
	</p>

	<!-- Search & Filter Controls -->
	<div class="search-section">
		<div class="search-bar">
			<span class="search-icon">🔍</span>
			<input
				type="search"
				class="search-input"
				placeholder="ツール名、キーワードで検索 (例: 圧縮、WebP、動画、ポート)..."
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button class="clear-btn" onclick={() => (searchQuery = '')} aria-label="検索クリア">✕</button>
			{/if}
		</div>

		<div class="category-tabs" role="tablist">
			<button
				class="tab-btn"
				class:active={selectedCategory === 'all'}
				onclick={() => (selectedCategory = 'all')}
				role="tab"
			>
				すべて ({tools.length})
			</button>
			<button
				class="tab-btn"
				class:active={selectedCategory === 'image'}
				onclick={() => (selectedCategory = 'image')}
				role="tab"
			>
				画像ツール (4)
			</button>
			<button
				class="tab-btn"
				class:active={selectedCategory === 'video'}
				onclick={() => (selectedCategory = 'video')}
				role="tab"
			>
				動画ツール (1)
			</button>
			<button
				class="tab-btn"
				class:active={selectedCategory === 'network'}
				onclick={() => (selectedCategory = 'network')}
				role="tab"
			>
				ネットワーク (1)
			</button>
		</div>
	</div>
</div>

<!-- Tools Grid -->
<div class="tools-grid">
	{#each filteredTools as tool (tool.id)}
		<a href={tool.href} class="tool-card">
			<div class="tool-header">
				<span class="tool-icon">{tool.icon}</span>
				<h2 class="tool-name">{tool.title}</h2>
			</div>
			<p class="tool-desc">{tool.description}</p>
			<div class="tool-tags">
				{#each tool.tags as tag}
					<span class="badge badge-primary">{tag}</span>
				{/each}
			</div>
			<div class="tool-footer">
				<span class="open-link">ツールを使う &rarr;</span>
			</div>
		</a>
	{:else}
		<div class="no-results">
			<p>「{searchQuery}」に一致するツールが見つかりませんでした。</p>
			<button class="btn btn-secondary btn-sm" onclick={() => { searchQuery = ''; selectedCategory = 'all'; }}>
				条件をリセット
			</button>
		</div>
	{/each}
</div>

<style>
	.hero {
		text-align: center;
		margin-bottom: 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.hero-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.8rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--primary);
		background-color: var(--primary-light);
		border-radius: var(--radius-full);
		margin-bottom: 1rem;
	}

	.hero-title {
		font-size: 2.5rem;
		font-weight: 800;
		line-height: 1.2;
		color: var(--text-primary);
		margin-bottom: 1rem;
		letter-spacing: -0.02em;
	}

	.hero-sub {
		max-width: 650px;
		font-size: 1.05rem;
		color: var(--text-secondary);
		line-height: 1.6;
		margin-bottom: 2rem;
	}

	.search-section {
		width: 100%;
		max-width: 700px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.search-bar {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 1rem;
		font-size: 1.1rem;
		pointer-events: none;
		color: var(--text-muted);
	}

	.search-input {
		width: 100%;
		padding: 0.85rem 2.8rem;
		font-size: 1rem;
		border-radius: var(--radius-full);
		border: 1px solid var(--border);
		background-color: var(--bg-card);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
		transition: all var(--transition-fast);
	}

	.search-input:focus {
		outline: none;
		border-color: var(--border-active);
		box-shadow: 0 0 0 4px var(--primary-light);
	}

	.clear-btn {
		position: absolute;
		right: 1rem;
		background: none;
		border: none;
		font-size: 1rem;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.2rem;
	}

	.category-tabs {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tab-btn {
		padding: 0.4rem 0.9rem;
		border-radius: var(--radius-full);
		font-size: 0.88rem;
		font-weight: 500;
		background-color: var(--bg-card);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.tab-btn:hover {
		background-color: var(--bg-card-hover);
		color: var(--text-primary);
	}

	.tab-btn.active {
		background-color: var(--primary);
		color: #ffffff;
		border-color: var(--primary);
	}

	.tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.tool-card {
		background-color: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		text-decoration: none;
		transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
	}

	.tool-card:hover {
		transform: translateY(-3px);
		border-color: var(--primary);
		box-shadow: var(--shadow-md);
		text-decoration: none;
	}

	.tool-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.tool-icon {
		font-size: 1.8rem;
		background-color: var(--primary-light);
		padding: 0.4rem;
		border-radius: var(--radius-md);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.tool-name {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.01em;
	}

	.tool-desc {
		font-size: 0.92rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin-bottom: 1.25rem;
		flex-grow: 1;
	}

	.tool-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.25rem;
	}

	.tool-footer {
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
	}

	.open-link {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--primary);
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.tool-card:hover .open-link {
		text-decoration: underline;
	}

	.no-results {
		grid-column: 1 / -1;
		text-align: center;
		padding: 4rem 1rem;
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	@media (max-width: 640px) {
		.hero-title {
			font-size: 1.85rem;
		}
		.tools-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
