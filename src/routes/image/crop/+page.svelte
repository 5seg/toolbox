<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { formatBytes } from '#lib/services/image-processor';

	let file = $state<File | null>(null);
	let imageUrl = $state<string | null>(null);
	let imgElement = $state<HTMLImageElement | null>(null);
	let canvasContainerRef = $state<HTMLDivElement | null>(null);

	// Crop box state (percentages relative to image display size)
	let cropX = $state(10);
	let cropY = $state(10);
	let cropW = $state(80);
	let cropH = $state(80);

	let aspectRatio = $state<'free' | '1:1' | '16:9' | '4:3' | '3:2' | '9:16'>('free');
	let rotation = $state(0); // 0, 90, 180, 270
	let flipH = $state(false);
	let flipV = $state(false);

	let outputFormat = $state<'png' | 'jpeg' | 'webp'>('png');
	let outputQuality = $state(90);

	let isDraggingBox = $state(false);
	let isResizingHandle = $state<string | null>(null);
	let startDragX = 0;
	let startDragY = 0;
	let initialCropX = 0;
	let initialCropY = 0;
	let initialCropW = 0;
	let initialCropH = 0;

	let previewUrl = $state<string | null>(null);
	let previewSize = $state(0);
	let croppedWidth = $state(0);
	let croppedHeight = $state(0);
	let fileInputRef = $state<HTMLInputElement | null>(null);

	onDestroy(() => {
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});

	function handleFile(newFile: File | null) {
		if (!newFile) return;
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		if (previewUrl) URL.revokeObjectURL(previewUrl);

		file = newFile;
		imageUrl = URL.createObjectURL(newFile);
		rotation = 0;
		flipH = false;
		flipV = false;
		resetCrop();
	}

	function resetCrop() {
		cropX = 10;
		cropY = 10;
		cropW = 80;
		cropH = 80;
		applyAspectRatio();
	}

	function applyAspectRatio() {
		if (aspectRatio === 'free') return;
		let ratio = 1;
		switch (aspectRatio) {
			case '1:1': ratio = 1; break;
			case '16:9': ratio = 16 / 9; break;
			case '4:3': ratio = 4 / 3; break;
			case '3:2': ratio = 3 / 2; break;
			case '9:16': ratio = 9 / 16; break;
		}

		if (!imgElement) return;
		const displayWidth = imgElement.clientWidth;
		const displayHeight = imgElement.clientHeight;
		if (displayWidth === 0 || displayHeight === 0) return;

		// Calculate height from width keeping ratio
		const newWpx = (cropW / 100) * displayWidth;
		const newHpx = newWpx / ratio;
		cropH = Math.min(100 - cropY, Math.max(10, (newHpx / displayHeight) * 100));

		updateCropPreview();
	}

	function onPointerDownBox(e: PointerEvent) {
		e.stopPropagation();
		isDraggingBox = true;
		startDragX = e.clientX;
		startDragY = e.clientY;
		initialCropX = cropX;
		initialCropY = cropY;
	}

	function onPointerDownHandle(e: PointerEvent, handle: string) {
		e.stopPropagation();
		isResizingHandle = handle;
		startDragX = e.clientX;
		startDragY = e.clientY;
		initialCropX = cropX;
		initialCropY = cropY;
		initialCropW = cropW;
		initialCropH = cropH;
	}

	function onPointerMove(e: PointerEvent) {
		if (!canvasContainerRef || !imgElement) return;
		const rect = imgElement.getBoundingClientRect();
		const dx = ((e.clientX - startDragX) / rect.width) * 100;
		const dy = ((e.clientY - startDragY) / rect.height) * 100;

		if (isDraggingBox) {
			let newX = initialCropX + dx;
			let newY = initialCropY + dy;
			newX = Math.max(0, Math.min(newX, 100 - cropW));
			newY = Math.max(0, Math.min(newY, 100 - cropH));
			cropX = newX;
			cropY = newY;
			updateCropPreview();
		} else if (isResizingHandle) {
			let newX = initialCropX;
			let newY = initialCropY;
			let newW = initialCropW;
			let newH = initialCropH;

			if (isResizingHandle.includes('e')) newW = Math.max(5, Math.min(initialCropW + dx, 100 - initialCropX));
			if (isResizingHandle.includes('s')) newH = Math.max(5, Math.min(initialCropH + dy, 100 - initialCropY));
			if (isResizingHandle.includes('w')) {
				const maxDx = initialCropW - 5;
				const clampedDx = Math.max(-initialCropX, Math.min(dx, maxDx));
				newX = initialCropX + clampedDx;
				newW = initialCropW - clampedDx;
			}
			if (isResizingHandle.includes('n')) {
				const maxDy = initialCropH - 5;
				const clampedDy = Math.max(-initialCropY, Math.min(dy, maxDy));
				newY = initialCropY + clampedDy;
				newH = initialCropH - clampedDy;
			}

			cropX = newX;
			cropY = newY;
			cropW = newW;
			cropH = newH;
			applyAspectRatio();
			updateCropPreview();
		}
	}

	function onPointerUp() {
		isDraggingBox = false;
		isResizingHandle = null;
		updateCropPreview();
	}

	function rotateRight() {
		rotation = (rotation + 90) % 360;
		updateCropPreview();
	}

	async function updateCropPreview() {
		if (!file || !imgElement) return;

		const img = new Image();
		await new Promise((resolve) => {
			img.onload = resolve;
			img.src = imageUrl!;
		});

		// Create offscreen canvas for transformed full image
		const fullCanvas = document.createElement('canvas');
		const fullCtx = fullCanvas.getContext('2d')!;

		const isQuarterTurn = rotation === 90 || rotation === 270;
		fullCanvas.width = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
		fullCanvas.height = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

		fullCtx.translate(fullCanvas.width / 2, fullCanvas.height / 2);
		fullCtx.rotate((rotation * Math.PI) / 180);
		fullCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
		fullCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

		// Now crop according to percentage
		const sx = (cropX / 100) * fullCanvas.width;
		const sy = (cropY / 100) * fullCanvas.height;
		const sw = (cropW / 100) * fullCanvas.width;
		const sh = (cropH / 100) * fullCanvas.height;

		const cropCanvas = document.createElement('canvas');
		cropCanvas.width = Math.max(1, Math.round(sw));
		cropCanvas.height = Math.max(1, Math.round(sh));
		croppedWidth = cropCanvas.width;
		croppedHeight = cropCanvas.height;

		const cropCtx = cropCanvas.getContext('2d')!;
		cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

		const mimeType = outputFormat === 'png' ? 'image/png' : outputFormat === 'webp' ? 'image/webp' : 'image/jpeg';
		const blob = await new Promise<Blob>((resolve) => {
			cropCanvas.toBlob((b) => resolve(b!), mimeType, outputQuality / 100);
		});

		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(blob);
		previewSize = blob.size;
	}

	function downloadCropped() {
		if (!previewUrl || !file) return;
		const a = document.createElement('a');
		a.href = previewUrl;
		const baseName = file.name.replace(/\.[^/.]+$/, '');
		a.download = `${baseName}-cropped.${outputFormat === 'jpeg' ? 'jpg' : outputFormat}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
</script>

<svelte:head>
	<title>画像切り抜き (トリミング) | Webツールボックス</title>
</svelte:head>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="page-container">
	<div class="page-header">
		<a href="/" class="back-link">&larr; ツール一覧に戻る</a>
		<h1>✂️ 画像切り抜き (トリミング)</h1>
		<p class="page-desc">
			Canvasによる高速かつ正確なトリミング。SNSアイコンやバナー用のアスペクト比プリセット、回転、反転にも対応しています。
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
			<span class="dropzone-icon">✂️</span>
			<p class="dropzone-title">切り抜きたい画像をドラッグ＆ドロップ、または選択</p>
			<p class="dropzone-sub">PNG, JPEG, WebP, AVIF等に対応</p>
		</div>
	{:else}
		<div class="crop-layout">
			<!-- Canvas Editor Area -->
			<div class="editor-card card">
				<div class="editor-toolbar">
					<div class="toolbar-group">
						<button class="btn btn-secondary btn-sm" onclick={rotateRight} title="時計回りに90度回転">
							🔄 90°回転
						</button>
						<button
							class="btn btn-secondary btn-sm"
							class:active={flipH}
							onclick={() => { flipH = !flipH; updateCropPreview(); }}
						>
							↔️ 水平反転
						</button>
						<button
							class="btn btn-secondary btn-sm"
							class:active={flipV}
							onclick={() => { flipV = !flipV; updateCropPreview(); }}
						>
							↕️ 垂直反転
						</button>
						<button class="btn btn-secondary btn-sm" onclick={resetCrop}>
							リセット
						</button>
					</div>

					<button class="btn btn-secondary btn-sm" onclick={() => (file = null)}>
						別の画像
					</button>
				</div>

				<div class="crop-stage" bind:this={canvasContainerRef}>
					{#if imageUrl}
						<div class="img-wrapper">
							<!-- Target Image with transforms -->
							<img
								bind:this={imgElement}
								src={imageUrl}
								alt="トリミング対象"
								class="source-image"
								style="transform: rotate({rotation}deg) scale({flipH ? -1 : 1}, {flipV ? -1 : 1});"
								onload={updateCropPreview}
							/>

							<!-- Dark overlay outside crop box -->
							<div class="crop-box" style="top: {cropY}%; left: {cropX}%; width: {cropW}%; height: {cropH}%;">
								<div class="crop-box-inner" onpointerdown={onPointerDownBox} role="button" tabindex="0" aria-label="クロップ領域をドラッグ">
									<div class="grid-line horizontal h1"></div>
									<div class="grid-line horizontal h2"></div>
									<div class="grid-line vertical v1"></div>
									<div class="grid-line vertical v2"></div>
								</div>

								<!-- Handles -->
								<div class="handle nw" role="presentation" onpointerdown={(e) => onPointerDownHandle(e, 'nw')}></div>
								<div class="handle ne" role="presentation" onpointerdown={(e) => onPointerDownHandle(e, 'ne')}></div>
								<div class="handle sw" role="presentation" onpointerdown={(e) => onPointerDownHandle(e, 'sw')}></div>
								<div class="handle se" role="presentation" onpointerdown={(e) => onPointerDownHandle(e, 'se')}></div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Crop Controls & Preview -->
			<div class="controls-card card">
				<h2 class="panel-title">切り抜き設定</h2>

				<div class="control-group">
					<span class="control-label">アスペクト比</span>
					<div class="aspect-grid">
						{#each [
							{ id: 'free', label: '自由' },
							{ id: '1:1', label: '1:1 (正方形)' },
							{ id: '16:9', label: '16:9 (横長)' },
							{ id: '4:3', label: '4:3 (標準)' },
							{ id: '3:2', label: '3:2 (写真)' },
							{ id: '9:16', label: '9:16 (縦長)' }
						] as opt}
							<button
								type="button"
								class="aspect-btn"
								class:active={aspectRatio === opt.id}
								onclick={() => { aspectRatio = opt.id as any; applyAspectRatio(); }}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="control-group">
					<label for="outFmt" class="control-label">保存形式</label>
					<select id="outFmt" class="select" bind:value={outputFormat} onchange={updateCropPreview}>
						<option value="png">PNG (透明度維持・劣化なし)</option>
						<option value="jpeg">JPEG (標準写真向け)</option>
						<option value="webp">WebP (高効率)</option>
					</select>
				</div>

				{#if outputFormat !== 'png'}
					<div class="control-group">
						<label for="cropQuality" class="control-label">品質: {outputQuality}%</label>
						<input
							type="range"
							id="cropQuality"
							min="10"
							max="100"
							bind:value={outputQuality}
							oninput={updateCropPreview}
						/>
					</div>
				{/if}

				<!-- Live Preview -->
				<div class="preview-box">
					<span class="preview-title">プレビュー ({croppedWidth} &times; {croppedHeight} px)</span>
					{#if previewUrl}
						<div class="preview-img-wrap">
							<img src={previewUrl} alt="切り抜きプレビュー" class="preview-thumb" />
						</div>
						<div class="preview-meta">
							<span>ファイルサイズ: <strong>{formatBytes(previewSize)}</strong></span>
						</div>
					{/if}
				</div>

				<button
					class="btn btn-primary btn-lg download-btn"
					disabled={!previewUrl}
					onclick={downloadCropped}
				>
					💾 切り抜いた画像を保存
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

	.crop-layout {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.5rem;
		align-items: start;
	}

	.editor-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
	}

	.editor-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.toolbar-group {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.crop-stage {
		position: relative;
		width: 100%;
		min-height: 480px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-conic-gradient(var(--bg-muted) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		overflow: hidden;
		user-select: none;
	}

	.img-wrapper {
		position: relative;
		display: inline-block;
		max-width: 100%;
		max-height: 500px;
	}

	.source-image {
		display: block;
		max-width: 100%;
		max-height: 500px;
		object-fit: contain;
		pointer-events: none;
		transition: transform 0.2s ease;
	}

	.crop-box {
		position: absolute;
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
		border: 2px solid #ffffff;
		touch-action: none;
	}

	.crop-box-inner {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		cursor: move;
	}

	.grid-line {
		position: absolute;
		background-color: rgba(255, 255, 255, 0.35);
		pointer-events: none;
	}

	.grid-line.horizontal {
		left: 0;
		right: 0;
		height: 1px;
	}

	.grid-line.horizontal.h1 { top: 33.33%; }
	.grid-line.horizontal.h2 { top: 66.66%; }

	.grid-line.vertical {
		top: 0;
		bottom: 0;
		width: 1px;
	}

	.grid-line.vertical.v1 { left: 33.33%; }
	.grid-line.vertical.v2 { left: 66.66%; }

	.handle {
		position: absolute;
		width: 12px;
		height: 12px;
		background-color: var(--primary);
		border: 2px solid #ffffff;
		border-radius: 50%;
		z-index: 20;
	}

	.handle.nw { top: -6px; left: -6px; cursor: nwse-resize; }
	.handle.ne { top: -6px; right: -6px; cursor: nesw-resize; }
	.handle.sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
	.handle.se { bottom: -6px; right: -6px; cursor: nwse-resize; }

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

	.aspect-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	.aspect-btn {
		padding: 0.45rem 0.5rem;
		font-size: 0.82rem;
		border: 1px solid var(--border);
		background-color: var(--bg-card);
		color: var(--text-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.aspect-btn:hover {
		background-color: var(--bg-card-hover);
	}

	.aspect-btn.active {
		background-color: var(--primary);
		color: #ffffff;
		border-color: var(--primary);
		font-weight: 600;
	}

	.preview-box {
		background-color: var(--bg-muted);
		border-radius: var(--radius-md);
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.preview-title {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.preview-img-wrap {
		width: 100%;
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-conic-gradient(var(--bg-card) 0% 25%, transparent 0% 50%) 50% / 10px 10px;
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.preview-thumb {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.preview-meta {
		font-size: 0.82rem;
		color: var(--text-secondary);
	}

	.download-btn {
		width: 100%;
		margin-top: 0.5rem;
	}

	@media (max-width: 900px) {
		.crop-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
