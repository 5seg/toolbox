<script lang="ts">
	import { processImageWithWorker, formatBytes } from '#lib/services/image-processor';

	interface ConvertItem {
		id: string;
		file: File;
		previewUrl: string;
		status: 'idle' | 'processing' | 'done' | 'error';
		resultBlob?: Blob;
		resultUrl?: string;
		originalSize: number;
		newSize?: number;
		error?: string;
		format: 'webp' | 'jpeg' | 'png' | 'avif';
		quality: number;
	}

	let items = $state<ConvertItem[]>([]);
	let defaultFormat = $state<'webp' | 'jpeg' | 'png' | 'avif'>('webp');
	let defaultQuality = $state(80);
	let isDragging = $state(false);
	let fileInputRef = $state<HTMLInputElement | null>(null);

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;

		const newItems: ConvertItem[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|avif|gif|bmp|svg)$/i)) {
				continue;
			}
			const previewUrl = URL.createObjectURL(file);
			newItems.push({
				id: Math.random().toString(36).substring(2) + Date.now().toString(36),
				file,
				previewUrl,
				status: 'idle',
				originalSize: file.size,
				format: defaultFormat,
				quality: defaultQuality
			});
		}
		items = [...items, ...newItems];
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (e.dataTransfer?.files) {
			handleFiles(e.dataTransfer.files);
		}
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function onDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	async function convertSingleItem(item: ConvertItem) {
		item.status = 'processing';
		item.error = undefined;
		try {
			const res = await processImageWithWorker(item.file, {
				format: item.format,
				quality: item.quality
			});
			item.resultBlob = res.blob;
			item.resultUrl = res.url;
			item.newSize = res.newSize;
			item.status = 'done';
		} catch (err: any) {
			item.status = 'error';
			item.error = err?.message || '変換に失敗しました';
		}
	}

	async function convertAll() {
		for (const item of items) {
			if (item.status !== 'done') {
				await convertSingleItem(item);
			}
		}
	}

	function applyDefaultsToAll() {
		for (const item of items) {
			if (item.status === 'idle') {
				item.format = defaultFormat;
				item.quality = defaultQuality;
			}
		}
	}

	function removeItem(index: number) {
		const [removed] = items.splice(index, 1);
		if (removed) {
			URL.revokeObjectURL(removed.previewUrl);
			if (removed.resultUrl) URL.revokeObjectURL(removed.resultUrl);
		}
		items = [...items];
	}

	function clearAll() {
		for (const item of items) {
			URL.revokeObjectURL(item.previewUrl);
			if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
		}
		items = [];
	}

	function downloadItem(item: ConvertItem) {
		if (!item.resultUrl) return;
		const a = document.createElement('a');
		a.href = item.resultUrl;
		const baseName = item.file.name.replace(/\.[^/.]+$/, '');
		a.download = `${baseName}.${item.format === 'jpeg' ? 'jpg' : item.format}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function downloadAll() {
		const doneItems = items.filter((it) => it.status === 'done' && it.resultUrl);
		for (const item of doneItems) {
			downloadItem(item);
		}
	}
</script>

<svelte:head>
	<title>画像変換 | Webツールボックス</title>
</svelte:head>

<div class="page-container">
	<div class="page-header">
		<a href="/" class="back-link">&larr; ツール一覧に戻る</a>
		<h1>🔄 画像フォーマット変換</h1>
		<p class="page-desc">
			PNG, JPG, WebP, AVIF などを高品質な WebAssembly コーデック（@jsquash）で高速変換。すべての処理はブラウザの Web Worker 内で実行されます。
		</p>
	</div>

	<!-- Global Settings Bar -->
	<div class="card settings-card">
		<div class="settings-row">
			<div class="setting-item">
				<label for="defaultFormat" class="setting-label">変換後の形式</label>
				<select
					id="defaultFormat"
					class="select"
					bind:value={defaultFormat}
					onchange={applyDefaultsToAll}
				>
					<option value="webp">WebP (推奨・軽量高画質)</option>
					<option value="jpeg">JPEG / MozJPEG (汎用)</option>
					<option value="avif">AVIF (次世代高圧縮)</option>
					<option value="png">PNG (可逆圧縮)</option>
				</select>
			</div>

			{#if defaultFormat !== 'png'}
				<div class="setting-item">
					<label for="defaultQuality" class="setting-label">品質: {defaultQuality}%</label>
					<input
						type="range"
						id="defaultQuality"
						min="1"
						max="100"
						bind:value={defaultQuality}
						oninput={applyDefaultsToAll}
					/>
				</div>
			{/if}

			<div class="settings-actions">
				<button
					class="btn btn-primary"
					disabled={items.length === 0 || items.every((i) => i.status === 'done')}
					onclick={convertAll}
				>
					⚡ 一括変換する
				</button>
				{#if items.some((i) => i.status === 'done')}
					<button class="btn btn-secondary" onclick={downloadAll}>
						💾 変換済みを一括保存
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Dropzone -->
	<div
		class="dropzone"
		class:active={isDragging}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={() => fileInputRef?.click()}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && fileInputRef?.click()}
	>
		<input
			type="file"
			bind:this={fileInputRef}
			multiple
			accept="image/*,.avif,.webp,.png,.jpg,.jpeg,.bmp,.gif"
			class="sr-only"
			onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
		/>
		<span class="dropzone-icon">📁</span>
		<p class="dropzone-title">ここに画像をドラッグ＆ドロップ、またはクリックして選択</p>
		<p class="dropzone-sub">PNG, JPEG, WebP, AVIF, GIF, BMP 等に対応 (複数ファイル可)</p>
	</div>

	<!-- File List -->
	{#if items.length > 0}
		<div class="items-header">
			<h2>変換キュー ({items.length}件)</h2>
			<button class="btn btn-secondary btn-sm" onclick={clearAll}>すべてクリア</button>
		</div>

		<div class="items-list">
			{#each items as item, idx (item.id)}
				<div class="item-card card">
					<div class="item-preview">
						<img src={item.previewUrl} alt={item.file.name} class="thumb" />
					</div>

					<div class="item-info">
						<div class="item-name" title={item.file.name}>{item.file.name}</div>
						<div class="item-sizes">
							<span>元サイズ: {formatBytes(item.originalSize)}</span>
							{#if item.newSize}
								<span class="size-arrow">&rarr;</span>
								<span class="new-size">{formatBytes(item.newSize)}</span>
								{@const diff = Math.round((1 - item.newSize / item.originalSize) * 100)}
								<span class="badge {diff >= 0 ? 'badge-success' : 'badge-warning'}">
									{diff >= 0 ? `-${diff}%` : `+${Math.abs(diff)}%`}
								</span>
							{/if}
						</div>
					</div>

					<div class="item-options">
						<select class="select item-select" bind:value={item.format} disabled={item.status === 'processing'}>
							<option value="webp">WebP</option>
							<option value="jpeg">JPEG</option>
							<option value="avif">AVIF</option>
							<option value="png">PNG</option>
						</select>

						{#if item.format !== 'png'}
							<div class="item-quality">
								<span class="item-q-label">Q: {item.quality}</span>
								<input
									type="range"
									min="1"
									max="100"
									bind:value={item.quality}
									disabled={item.status === 'processing'}
								/>
							</div>
						{/if}
					</div>

					<div class="item-status-col">
						{#if item.status === 'idle'}
							<button class="btn btn-primary btn-sm" onclick={() => convertSingleItem(item)}>
								変換
							</button>
						{:else if item.status === 'processing'}
							<span class="badge badge-primary">変換中...</span>
						{:else if item.status === 'done'}
							<button class="btn btn-secondary btn-sm" onclick={() => downloadItem(item)}>
								保存
							</button>
						{:else if item.status === 'error'}
							<span class="badge badge-danger" title={item.error}>エラー</span>
							<button class="btn btn-sm btn-secondary" onclick={() => convertSingleItem(item)}>再試行</button>
						{/if}
						<button class="delete-btn" onclick={() => removeItem(idx)} aria-label="削除">✕</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.page-header {
		margin-bottom: 0.5rem;
	}

	.back-link {
		display: inline-block;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
		color: var(--text-muted);
	}

	.back-link:hover {
		color: var(--primary);
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 0.5rem;
	}

	.page-desc {
		color: var(--text-secondary);
		max-width: 800px;
	}

	.settings-card {
		padding: 1.25rem 1.5rem;
	}

	.settings-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.5rem;
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 200px;
	}

	.setting-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.settings-actions {
		display: flex;
		gap: 0.75rem;
		margin-left: auto;
	}

	.dropzone-title {
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.dropzone-sub {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.items-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 1rem;
	}

	.items-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
	}

	.items-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.item-card {
		display: grid;
		grid-template-columns: 60px 1.5fr 1fr auto;
		align-items: center;
		gap: 1.25rem;
		padding: 0.85rem 1.25rem;
	}

	.thumb {
		width: 60px;
		height: 60px;
		object-fit: cover;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background-color: var(--bg-muted);
	}

	.item-info {
		overflow: hidden;
	}

	.item-name {
		font-weight: 600;
		font-size: 0.95rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--text-primary);
	}

	.item-sizes {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
	}

	.size-arrow {
		color: var(--text-muted);
	}

	.new-size {
		color: var(--text-primary);
		font-weight: 600;
	}

	.item-options {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.item-select {
		width: 100px;
		padding: 0.4rem 0.5rem;
		font-size: 0.88rem;
	}

	.item-quality {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		width: 110px;
	}

	.item-q-label {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.item-status-col {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.delete-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.25rem;
		transition: color var(--transition-fast);
	}

	.delete-btn:hover {
		color: var(--danger);
	}

	@media (max-width: 768px) {
		.item-card {
			grid-template-columns: 50px 1fr;
			gap: 0.75rem;
		}

		.item-options, .item-status-col {
			grid-column: 1 / -1;
			justify-content: flex-start;
		}
	}
</style>
