<script lang="ts">
	import { onDestroy } from 'svelte';
	import { processImageWithWorker, formatBytes } from '#lib/services/image-processor';

	let file = $state<File | null>(null);
	let originalUrl = $state<string | null>(null);
	let resizedUrl = $state<string | null>(null);

	let origWidth = $state(0);
	let origHeight = $state(0);

	let targetWidth = $state(0);
	let targetHeight = $state(0);
	let keepAspectRatio = $state(true);

	let format = $state<'webp' | 'jpeg' | 'png' | 'avif'>('webp');
	let quality = $state(85);

	let isProcessing = $state(false);
	let resizedSize = $state(0);
	let fileInputRef = $state<HTMLInputElement | null>(null);

	onDestroy(() => {
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		if (resizedUrl) URL.revokeObjectURL(resizedUrl);
	});

	function handleFile(newFile: File | null) {
		if (!newFile) return;
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		if (resizedUrl) URL.revokeObjectURL(resizedUrl);

		file = newFile;
		originalUrl = URL.createObjectURL(newFile);

		const img = new Image();
		img.onload = () => {
			origWidth = img.naturalWidth;
			origHeight = img.naturalHeight;
			targetWidth = origWidth;
			targetHeight = origHeight;
			executeResize();
		};
		img.src = originalUrl;
	}

	function onWidthChange(newW: number) {
		targetWidth = Math.max(1, newW);
		if (keepAspectRatio && origWidth > 0) {
			const ratio = origHeight / origWidth;
			targetHeight = Math.max(1, Math.round(targetWidth * ratio));
		}
		executeResize();
	}

	function onHeightChange(newH: number) {
		targetHeight = Math.max(1, newH);
		if (keepAspectRatio && origHeight > 0) {
			const ratio = origWidth / origHeight;
			targetWidth = Math.max(1, Math.round(targetHeight * ratio));
		}
		executeResize();
	}

	function applyPercentage(pct: number) {
		if (origWidth === 0 || origHeight === 0) return;
		targetWidth = Math.max(1, Math.round((origWidth * pct) / 100));
		targetHeight = Math.max(1, Math.round((origHeight * pct) / 100));
		executeResize();
	}

	function applyPreset(w: number, h: number) {
		targetWidth = w;
		targetHeight = h;
		executeResize();
	}

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	function executeResize() {
		if (!file) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			isProcessing = true;
			try {
				const res = await processImageWithWorker(file!, {
					format,
					quality,
					targetWidth,
					targetHeight
				});
				if (resizedUrl) URL.revokeObjectURL(resizedUrl);
				resizedUrl = res.url;
				resizedSize = res.newSize;
			} catch (err) {
				console.error('Resize failed:', err);
			} finally {
				isProcessing = false;
			}
		}, 250);
	}

	function downloadResized() {
		if (!resizedUrl || !file) return;
		const a = document.createElement('a');
		a.href = resizedUrl;
		const baseName = file.name.replace(/\.[^/.]+$/, '');
		a.download = `${baseName}-${targetWidth}x${targetHeight}.${format === 'jpeg' ? 'jpg' : format}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
</script>

<svelte:head>
	<title>画像リサイズ | Webツールボックス</title>
</svelte:head>

<div class="page-container">
	<div class="page-header">
		<a href="/" class="back-link">&larr; ツール一覧に戻る</a>
		<h1>📐 画像リサイズ</h1>
		<p class="page-desc">
			ピクセル指定、パーセント指定、アスペクト比固定など自在に画像サイズを変更。高品質な補間アルゴリズムで縮小・拡大します。
		</p>
	</div>

	{#if !file}
		<div
			class="dropzone"
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
			<span class="dropzone-icon">📐</span>
			<p class="dropzone-title">リサイズしたい画像をドラッグ＆ドロップ、または選択</p>
			<p class="dropzone-sub">PNG, JPEG, WebP, AVIF等に対応</p>
		</div>
	{:else}
		<div class="workspace-grid">
			<!-- Preview Area -->
			<div class="viewer-card card">
				<div class="viewer-header">
					<div class="meta-tag">
						<span class="file-name">{file.name}</span>
						<span class="badge badge-muted">元: {origWidth} &times; {origHeight} px ({formatBytes(file.size)})</span>
					</div>
					<button class="btn btn-secondary btn-sm" onclick={() => (file = null)}>別の画像</button>
				</div>

				<div class="preview-stage">
					{#if resizedUrl}
						<img src={resizedUrl} alt="リサイズ後プレビュー" class="preview-img" />
					{:else if originalUrl}
						<img src={originalUrl} alt="元画像プレビュー" class="preview-img" />
					{/if}
				</div>

				<div class="preview-footer">
					<div class="footer-meta">
						<span>現在のサイズ: <strong>{targetWidth} &times; {targetHeight} px</strong></span>
						{#if resizedSize > 0}
							<span>ファイルサイズ: <strong>{formatBytes(resizedSize)}</strong></span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Controls Panel -->
			<div class="controls-card card">
				<h2 class="panel-title">サイズ指定</h2>

				<!-- Dimension inputs -->
				<div class="dim-row">
					<div class="dim-field">
						<label for="widthInput" class="control-label">幅 (px)</label>
						<input
							type="number"
							id="widthInput"
							class="input"
							min="1"
							max="10000"
							value={targetWidth}
							oninput={(e) => onWidthChange(Number((e.target as HTMLInputElement).value))}
						/>
					</div>

					<button
						type="button"
						class="ratio-lock-btn"
						class:active={keepAspectRatio}
						onclick={() => (keepAspectRatio = !keepAspectRatio)}
						title={keepAspectRatio ? 'アスペクト比を固定中 (クリックで解除)' : 'アスペクト比は自由 (クリックで固定)'}
						aria-label="縦横比固定トグル"
					>
						{keepAspectRatio ? '🔗' : '🔓'}
					</button>

					<div class="dim-field">
						<label for="heightInput" class="control-label">高さ (px)</label>
						<input
							type="number"
							id="heightInput"
							class="input"
							min="1"
							max="10000"
							value={targetHeight}
							oninput={(e) => onHeightChange(Number((e.target as HTMLInputElement).value))}
						/>
					</div>
				</div>

				<!-- Percent presets -->
				<div class="control-group">
					<span class="control-label">倍率プリセット</span>
					<div class="btn-group">
						{#each [25, 50, 75, 150, 200] as pct}
							<button type="button" class="btn btn-secondary btn-sm" onclick={() => applyPercentage(pct)}>
								{pct}%
							</button>
						{/each}
					</div>
				</div>

				<!-- Common resolutions -->
				<div class="control-group">
					<span class="control-label">解像度プリセット</span>
					<div class="preset-grid">
						<button type="button" class="btn btn-secondary btn-sm" onclick={() => applyPreset(1920, 1080)}>
							1920 &times; 1080 (FHD)
						</button>
						<button type="button" class="btn btn-secondary btn-sm" onclick={() => applyPreset(1280, 720)}>
							1280 &times; 720 (HD)
						</button>
						<button type="button" class="btn btn-secondary btn-sm" onclick={() => applyPreset(1080, 1080)}>
							1080 &times; 1080 (SNS)
						</button>
						<button type="button" class="btn btn-secondary btn-sm" onclick={() => applyPreset(800, 600)}>
							800 &times; 600
						</button>
					</div>
				</div>

				<hr class="divider" />

				<!-- Format & Quality -->
				<div class="control-group">
					<label for="formatSel" class="control-label">保存フォーマット</label>
					<select id="formatSel" class="select" bind:value={format} onchange={executeResize}>
						<option value="webp">WebP</option>
						<option value="jpeg">JPEG</option>
						<option value="png">PNG</option>
						<option value="avif">AVIF</option>
					</select>
				</div>

				{#if format !== 'png'}
					<div class="control-group">
						<label for="qualitySlider" class="control-label">画質: {quality}%</label>
						<input
							type="range"
							id="qualitySlider"
							min="1"
							max="100"
							bind:value={quality}
							oninput={executeResize}
						/>
					</div>
				{/if}

				<button
					class="btn btn-primary btn-lg download-btn"
					disabled={!resizedUrl || isProcessing}
					onclick={downloadResized}
				>
					{#if isProcessing}
						リサイズ中...
					{:else}
						💾 リサイズ画像を保存
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
	}

	.back-link {
		display: inline-block;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
		color: var(--text-muted);
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

	.viewer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.meta-tag {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow: hidden;
	}

	.file-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.preview-stage {
		width: 100%;
		height: 480px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-conic-gradient(var(--bg-muted) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		overflow: hidden;
	}

	.preview-img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.preview-footer {
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.footer-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
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

	.dim-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.dim-field {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.control-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.ratio-lock-btn {
		height: 42px;
		width: 42px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: 1.1rem;
		transition: all var(--transition-fast);
	}

	.ratio-lock-btn.active {
		background-color: var(--primary-light);
		border-color: var(--primary);
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.btn-group {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.btn-group .btn {
		flex: 1;
		min-width: 50px;
		padding: 0.4rem;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	.divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.25rem 0;
	}

	.download-btn {
		width: 100%;
		margin-top: 0.5rem;
	}

	@media (max-width: 900px) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}
		.preview-stage {
			height: 350px;
		}
	}
</style>
