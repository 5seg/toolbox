<script lang="ts">
	import { processImageWithWorker, formatBytes } from '#lib/services/image-processor';
	import { onDestroy } from 'svelte';

	let file = $state<File | null>(null);
	let originalUrl = $state<string | null>(null);
	let compressedUrl = $state<string | null>(null);
	let originalSize = $state(0);
	let compressedSize = $state(0);
	let imageDimensions = $state<{ width: number; height: number } | null>(null);

	let format = $state<'webp' | 'jpeg' | 'avif' | 'png'>('webp');
	let quality = $state(75);
	let isProcessing = $state(false);
	let processTime = $state(0);
	let splitPosition = $state(50); // percentage for split view (0 to 100)
	let isDraggingSplit = $state(false);
	let isDraggingFile = $state(false);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let compareContainerRef = $state<HTMLDivElement | null>(null);

	onDestroy(() => {
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		if (compressedUrl) URL.revokeObjectURL(compressedUrl);
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	function handleFile(newFile: File | null) {
		if (!newFile) return;
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		if (compressedUrl) URL.revokeObjectURL(compressedUrl);

		file = newFile;
		originalSize = newFile.size;
		originalUrl = URL.createObjectURL(newFile);

		const img = new Image();
		img.onload = () => {
			imageDimensions = { width: img.naturalWidth, height: img.naturalHeight };
		};
		img.src = originalUrl;

		triggerCompress();
	}

	function triggerCompress() {
		if (!file) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			compressNow();
		}, 300);
	}

	async function compressNow() {
		if (!file) return;
		isProcessing = true;
		const startTime = performance.now();
		try {
			const res = await processImageWithWorker(file, {
				format,
				quality
			});
			if (compressedUrl) URL.revokeObjectURL(compressedUrl);
			compressedUrl = res.url;
			compressedSize = res.newSize;
			processTime = Math.round(performance.now() - startTime);
		} catch (err) {
			console.error('Compression failed:', err);
		} finally {
			isProcessing = false;
		}
	}

	function onPointerDown(e: PointerEvent) {
		isDraggingSplit = true;
		updateSplit(e);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDraggingSplit) return;
		updateSplit(e);
	}

	function onPointerUp() {
		isDraggingSplit = false;
	}

	function updateSplit(e: PointerEvent) {
		if (!compareContainerRef) return;
		const rect = compareContainerRef.getBoundingClientRect();
		const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
		splitPosition = Math.round((x / rect.width) * 100);
	}

	function downloadCompressed() {
		if (!compressedUrl || !file) return;
		const a = document.createElement('a');
		a.href = compressedUrl;
		const baseName = file.name.replace(/\.[^/.]+$/, '');
		a.download = `${baseName}-compressed.${format === 'jpeg' ? 'jpg' : format}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
</script>

<svelte:head>
	<title>画像圧縮 (Squoosh相当) | Webツールボックス</title>
</svelte:head>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="page-container">
	<div class="page-header">
		<a href="/" class="back-link">&larr; ツール一覧に戻る</a>
		<h1>🗜️ 画像圧縮 (Squoosh相当)</h1>
		<p class="page-desc">
			画質を保ちながらファイルサイズを極限まで軽量化。スプリットビューで元画像と圧縮後の画質差をリアルタイムに確認できます。
		</p>
	</div>

	{#if !file}
		<!-- Dropzone -->
		<div
			class="dropzone"
			class:active={isDraggingFile}
			ondragover={(e) => { e.preventDefault(); isDraggingFile = true; }}
			ondragleave={(e) => { e.preventDefault(); isDraggingFile = false; }}
			ondrop={(e) => { e.preventDefault(); isDraggingFile = false; if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
			onclick={() => fileInputRef?.click()}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && fileInputRef?.click()}
		>
			<input
				type="file"
				bind:this={fileInputRef}
				accept="image/*"
				class="sr-only"
				onchange={(e) => {
					const target = e.target as HTMLInputElement;
					if (target.files?.[0]) handleFile(target.files[0]);
				}}
			/>
			<span class="dropzone-icon">📸</span>
			<p class="dropzone-title">圧縮したい画像をドラッグ＆ドロップ、またはクリックして選択</p>
			<p class="dropzone-sub">PNG, JPEG, WebP, AVIF等に対応</p>
		</div>
	{:else}
		<!-- Workspace -->
		<div class="workspace-grid">
			<!-- Comparison Canvas Area -->
			<div class="viewer-card card">
				<div class="viewer-toolbar">
					<div class="image-meta">
						<span class="file-name" title={file.name}>{file.name}</span>
						{#if imageDimensions}
							<span class="badge badge-muted">{imageDimensions.width} &times; {imageDimensions.height} px</span>
						{/if}
					</div>
					<button class="btn btn-secondary btn-sm" onclick={() => (file = null)}>
						別の画像を選択
					</button>
				</div>

				<div
					class="compare-container"
					bind:this={compareContainerRef}
					onpointerdown={onPointerDown}
					role="region"
					aria-label="画像比較スライダー"
				>
					{#if originalUrl}
						<!-- Original (Left side) -->
						<img src={originalUrl} alt="元画像" class="compare-img original" />

						<!-- Compressed (Right side, clipped) -->
						{#if compressedUrl}
							<div
								class="clipped-layer"
								style="clip-path: polygon({splitPosition}% 0, 100% 0, 100% 100%, {splitPosition}% 100%);"
							>
								<img src={compressedUrl} alt="圧縮後画像" class="compare-img compressed" />
							</div>
						{/if}

						<!-- Split divider bar -->
						<div class="split-divider" style="left: {splitPosition}%;">
							<div class="split-handle">
								<span>&#10094;</span>
								<span>&#10095;</span>
							</div>
						</div>

						<!-- Labels -->
						<div class="side-label label-left">元画像 ({formatBytes(originalSize)})</div>
						<div class="side-label label-right">
							圧縮後 ({compressedSize ? formatBytes(compressedSize) : '計算中...'})
						</div>
					{/if}
				</div>

				<div class="split-instruction">
					左右の仕切り線をドラッグして画質の違いを比較できます
				</div>
			</div>

			<!-- Controls Panel -->
			<div class="controls-card card">
				<h2 class="panel-title">圧縮設定</h2>

				<div class="control-group">
					<label for="formatSelect" class="control-label">圧縮フォーマット</label>
					<select
						id="formatSelect"
						class="select"
						bind:value={format}
						onchange={triggerCompress}
					>
						<option value="webp">WebP (高効率・ブラウザ標準)</option>
						<option value="avif">AVIF (最高圧縮率)</option>
						<option value="jpeg">MozJPEG (標準写真向け)</option>
						<option value="png">PNG (可逆圧縮)</option>
					</select>
				</div>

				{#if format !== 'png'}
					<div class="control-group">
						<div class="label-with-value">
							<label for="qualityRange" class="control-label">品質 (Quality)</label>
							<span class="range-val">{quality}</span>
						</div>
						<input
							type="range"
							id="qualityRange"
							min="1"
							max="100"
							bind:value={quality}
							oninput={triggerCompress}
						/>
						<div class="slider-ticks">
							<span>高圧縮 (小)</span>
							<span>バランス</span>
							<span>高画質 (大)</span>
						</div>
					</div>
				{/if}

				<!-- Results Summary -->
				<div class="summary-box">
					<div class="summary-row">
						<span class="summary-key">元ファイルサイズ:</span>
						<span class="summary-val">{formatBytes(originalSize)}</span>
					</div>
					<div class="summary-row">
						<span class="summary-key">圧縮後サイズ:</span>
						<span class="summary-val highlight">
							{compressedSize ? formatBytes(compressedSize) : '計算中...'}
						</span>
					</div>
					{#if compressedSize > 0}
						{@const diff = Math.round((1 - compressedSize / originalSize) * 100)}
						<div class="summary-row">
							<span class="summary-key">削減率:</span>
							<span class="summary-val">
								<span class="badge {diff >= 0 ? 'badge-success' : 'badge-warning'}">
									{diff >= 0 ? `-${diff}% 削減` : `+${Math.abs(diff)}% (元より大)`}
								</span>
							</span>
						</div>
					{/if}
					{#if processTime > 0}
						<div class="summary-row">
							<span class="summary-key">処理時間:</span>
							<span class="summary-val time-val">{processTime} ms</span>
						</div>
					{/if}
				</div>

				<button
					class="btn btn-primary btn-lg download-btn"
					disabled={!compressedUrl || isProcessing}
					onclick={downloadCompressed}
				>
					{#if isProcessing}
						処理中...
					{:else}
						💾 圧縮画像を保存
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 0.5rem;
	}

	.back-link {
		display: inline-block;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
		color: var(--text-muted);
	}

	.page-desc {
		color: var(--text-secondary);
		max-width: 800px;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.5rem;
		align-items: start;
	}

	.viewer-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
	}

	.viewer-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.image-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		overflow: hidden;
	}

	.file-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.compare-container {
		position: relative;
		width: 100%;
		height: 480px;
		background: repeating-conic-gradient(var(--bg-muted) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
		border-radius: var(--radius-md);
		overflow: hidden;
		user-select: none;
		touch-action: none;
		cursor: ew-resize;
		border: 1px solid var(--border);
	}

	.compare-img {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
	}

	.clipped-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.split-divider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background-color: var(--primary);
		pointer-events: none;
		transform: translateX(-50%);
		z-index: 10;
		box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
	}

	.split-handle {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background-color: var(--primary);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font-size: 0.75rem;
		box-shadow: var(--shadow-md);
	}

	.side-label {
		position: absolute;
		bottom: 0.75rem;
		padding: 0.25rem 0.6rem;
		background-color: rgba(0, 0, 0, 0.65);
		color: #ffffff;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: var(--radius-sm);
		pointer-events: none;
		z-index: 5;
	}

	.label-left {
		left: 0.75rem;
	}

	.label-right {
		right: 0.75rem;
	}

	.split-instruction {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-align: center;
	}

	.controls-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1.5rem;
	}

	.panel-title {
		font-size: 1.2rem;
		font-weight: 700;
		border-bottom: 1px solid var(--border);
		padding-bottom: 0.75rem;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.control-label {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.label-with-value {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.range-val {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--primary);
	}

	.slider-ticks {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.summary-box {
		background-color: var(--bg-muted);
		border-radius: var(--radius-md);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.summary-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.88rem;
	}

	.summary-key {
		color: var(--text-secondary);
	}

	.summary-val {
		font-weight: 600;
		color: var(--text-primary);
	}

	.summary-val.highlight {
		color: var(--primary);
		font-size: 1rem;
	}

	.time-val {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.download-btn {
		width: 100%;
		margin-top: 0.5rem;
	}

	@media (max-width: 900px) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}

		.compare-container {
			height: 360px;
		}
	}
</style>
