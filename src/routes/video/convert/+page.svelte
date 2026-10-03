<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatBytes } from '#lib/services/image-processor';

	let file = $state<File | null>(null);
	let outputFormat = $state<'mp4' | 'webm' | 'gif' | 'mp3' | 'wav'>('mp4');

	let isLoaded = $state(false);
	let isLoadingCore = $state(false);
	let isConverting = $state(false);
	let progressPercent = $state(0);
	let logs = $state<string[]>([]);
	let showLogs = $state(false);
	let statusMessage = $state('待機中');

	let resultUrl = $state<string | null>(null);
	let resultBlob = $state<Blob | null>(null);
	let resultSize = $state(0);
	let originalSize = $state(0);
	let conversionTime = $state(0);
	let errorMessage = $state<string | null>(null);

	let ffmpegInstance: any = null;
	let fileInputRef = $state<HTMLInputElement | null>(null);

	onDestroy(() => {
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		if (ffmpegInstance) {
			try {
				ffmpegInstance.terminate();
			} catch {}
		}
	});

	function handleFile(newFile: File | null) {
		if (!newFile) return;
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		resultUrl = null;
		resultBlob = null;
		resultSize = 0;
		errorMessage = null;
		logs = [];
		progressPercent = 0;

		file = newFile;
		originalSize = newFile.size;
	}

	async function initFFmpeg() {
		if (ffmpegInstance && isLoaded) return ffmpegInstance;

		isLoadingCore = true;
		statusMessage = 'ffmpeg.wasm (単一スレッド版) を読み込み中...';
		try {
			const { FFmpeg } = await import('@ffmpeg/ffmpeg');
			const { toBlobURL } = await import('@ffmpeg/util');

			const ffmpeg = new FFmpeg();

			ffmpeg.on('log', ({ message }) => {
				logs = [...logs.slice(-100), message];
			});

			ffmpeg.on('progress', ({ progress, time }) => {
				const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
				progressPercent = pct;
				statusMessage = `変換中... ${pct}%`;
			});

			// Single-threaded core URL (does not require COOP/COEP headers)
			const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
			await ffmpeg.load({
				coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
				wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
			});

			ffmpegInstance = ffmpeg;
			isLoaded = true;
			isLoadingCore = false;
			return ffmpeg;
		} catch (err: any) {
			isLoadingCore = false;
			throw new Error(`ffmpegのロードに失敗しました: ${err?.message || 'ネットワークエラー'}`);
		}
	}

	async function startConversion() {
		if (!file) return;
		isConverting = true;
		errorMessage = null;
		progressPercent = 0;
		logs = [];
		const startTime = performance.now();

		try {
			const ffmpeg = await initFFmpeg();
			const { fetchFile } = await import('@ffmpeg/util');

			statusMessage = 'ファイルを読み込み中...';
			const inputExt = file.name.split('.').pop() || 'mp4';
			const inputName = `input.${inputExt}`;
			const outputName = `output.${outputFormat}`;

			await ffmpeg.writeFile(inputName, await fetchFile(file));

			statusMessage = '変換処理を実行中...';

			// Build ffmpeg arguments based on target format
			let ffmpegArgs: string[] = ['-i', inputName];

			switch (outputFormat) {
				case 'mp4':
					ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', outputName);
					break;
				case 'webm':
					ffmpegArgs.push('-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis', outputName);
					break;
				case 'gif':
					ffmpegArgs.push('-vf', 'fps=12,scale=480:-1:flags=lanczos', outputName);
					break;
				case 'mp3':
					ffmpegArgs.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2', outputName);
					break;
				case 'wav':
					ffmpegArgs.push('-vn', '-c:a', 'pcm_s16le', outputName);
					break;
			}

			await ffmpeg.exec(ffmpegArgs);

			statusMessage = '変換完了。結果を取得中...';
			const data = await ffmpeg.readFile(outputName);

			let mimeType = 'video/mp4';
			if (outputFormat === 'webm') mimeType = 'video/webm';
			else if (outputFormat === 'gif') mimeType = 'image/gif';
			else if (outputFormat === 'mp3') mimeType = 'audio/mpeg';
			else if (outputFormat === 'wav') mimeType = 'audio/wav';

			// Clean up files in virtual fs
			await ffmpeg.deleteFile(inputName).catch(() => {});
			await ffmpeg.deleteFile(outputName).catch(() => {});

			const blob = new Blob([data as any], { type: mimeType });
			if (resultUrl) URL.revokeObjectURL(resultUrl);
			resultBlob = blob;
			resultUrl = URL.createObjectURL(blob);
			resultSize = blob.size;
			conversionTime = Math.round((performance.now() - startTime) / 1000);
			progressPercent = 100;
			statusMessage = '変換が完了しました！';
		} catch (err: any) {
			console.error(err);
			errorMessage = err?.message || '変換中にエラーが発生しました';
			statusMessage = 'エラーが発生しました';
		} finally {
			isConverting = false;
		}
	}

	function downloadResult() {
		if (!resultUrl || !file) return;
		const a = document.createElement('a');
		a.href = resultUrl;
		const baseName = file.name.replace(/\.[^/.]+$/, '');
		a.download = `${baseName}.${outputFormat}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
</script>

<svelte:head>
	<title>動画変換 (ffmpeg.wasm) | Webツールボックス</title>
</svelte:head>

<div class="page-container">
	<div class="page-header">
		<a href="/" class="back-link">&larr; ツール一覧に戻る</a>
		<h1>🎬 動画変換・音声抽出 (ffmpeg.wasm)</h1>
		<p class="page-desc">
			単一スレッド版 ffmpeg.wasm を使用し、ブラウザ内で安全に動画変換・音声抽出。COOP/COEP設定が不要で、外部サーバーに動画を送信することなく完結します。
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
				accept="video/*,audio/*,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.m4a"
				class="sr-only"
				onchange={(e) => {
					const target = e.target as HTMLInputElement;
					if (target.files?.[0]) handleFile(target.files[0]);
				}}
			/>
			<span class="dropzone-icon">🎬</span>
			<p class="dropzone-title">変換したい動画・音声ファイルをドラッグ＆ドロップ、または選択</p>
			<p class="dropzone-sub">MP4, WebM, MOV, AVI, MKV, MP3, WAV 等に対応</p>
		</div>
	{:else}
		<div class="workspace-grid">
			<!-- Settings & Conversion Area -->
			<div class="main-card card">
				<div class="file-summary">
					<div class="file-details">
						<span class="file-icon">📼</span>
						<div>
							<div class="file-name" title={file.name}>{file.name}</div>
							<div class="file-meta">
								<span>サイズ: {formatBytes(originalSize)}</span>
								<span>形式: {file.type || file.name.split('.').pop()?.toUpperCase()}</span>
							</div>
						</div>
					</div>
					<button class="btn btn-secondary btn-sm" onclick={() => (file = null)} disabled={isConverting}>
						別のファイル
					</button>
				</div>

				<hr class="divider" />

				<div class="conversion-form">
					<div class="form-group">
						<label for="outFormat" class="form-label">変換先のフォーマット</label>
						<select
							id="outFormat"
							class="select"
							bind:value={outputFormat}
							disabled={isConverting}
						>
							<optgroup label="動画形式">
								<option value="mp4">MP4 (H.264 / AAC - 標準)</option>
								<option value="webm">WebM (VP8 / Vorbis)</option>
								<option value="gif">GIF アニメーション</option>
							</optgroup>
							<optgroup label="音声形式 (抽出)">
								<option value="mp3">MP3 (高音質音声抽出)</option>
								<option value="wav">WAV (非圧縮ロスレス)</option>
							</optgroup>
						</select>
					</div>

					{#if isLoadingCore || isConverting}
						<div class="progress-section">
							<div class="progress-info">
								<span class="status-msg">{statusMessage}</span>
								<span class="pct-val">{progressPercent}%</span>
							</div>
							<div class="progress-bar-track">
								<div class="progress-bar-fill" style="width: {progressPercent}%;"></div>
							</div>
						</div>
					{/if}

					{#if errorMessage}
						<div class="error-box">
							⚠️ {errorMessage}
						</div>
					{/if}

					<div class="action-buttons">
						<button
							class="btn btn-primary btn-lg"
							disabled={isConverting || isLoadingCore}
							onclick={startConversion}
						>
							{#if isLoadingCore}
								⏳ ffmpegロード中...
							{:else if isConverting}
								🔄 変換処理中...
							{:else}
								🚀 変換を開始する
							{/if}
						</button>

						<button
							type="button"
							class="btn btn-secondary btn-sm"
							onclick={() => (showLogs = !showLogs)}
						>
							{showLogs ? 'コンソールログを隠す' : 'コンソールログを表示'}
						</button>
					</div>

					{#if showLogs}
						<div class="console-box">
							<div class="console-header">ffmpeg 出力ログ</div>
							<pre class="console-content">{logs.join('\n') || 'ログはまだありません'}</pre>
						</div>
					{/if}
				</div>
			</div>

			<!-- Result Card -->
			<div class="result-card card">
				<h2 class="panel-title">変換結果</h2>

				{#if resultUrl}
					<div class="result-media-wrap">
						{#if outputFormat === 'mp4' || outputFormat === 'webm'}
							<video src={resultUrl} controls class="result-media">
								<track kind="captions" />
							</video>
						{:else if outputFormat === 'gif'}
							<img src={resultUrl} alt="GIFプレビュー" class="result-media" />
						{:else if outputFormat === 'mp3' || outputFormat === 'wav'}
							<audio src={resultUrl} controls class="audio-player"></audio>
						{/if}
					</div>

					<div class="result-stats">
						<div class="stat-row">
							<span>出力サイズ:</span>
							<strong>{formatBytes(resultSize)}</strong>
						</div>
						<div class="stat-row">
							<span>所要時間:</span>
							<span>{conversionTime} 秒</span>
						</div>
					</div>

					<button class="btn btn-primary btn-lg download-btn" onclick={downloadResult}>
						💾 ファイルをダウンロード
					</button>
				{:else}
					<div class="placeholder-box">
						<span class="placeholder-icon">📥</span>
						<p>変換が完了すると、ここにプレビューとダウンロードボタンが表示されます。</p>
					</div>
				{/if}
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
		grid-template-columns: 1fr 360px;
		gap: 1.5rem;
		align-items: start;
	}

	.main-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1.5rem;
	}

	.file-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.file-details {
		display: flex;
		align-items: center;
		gap: 1rem;
		overflow: hidden;
	}

	.file-icon {
		font-size: 2rem;
	}

	.file-name {
		font-weight: 700;
		font-size: 1.05rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.divider {
		border: none;
		border-top: 1px solid var(--border);
	}

	.conversion-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.form-label {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background-color: var(--bg-muted);
		padding: 1rem;
		border-radius: var(--radius-md);
	}

	.progress-info {
		display: flex;
		justify-content: space-between;
		font-size: 0.88rem;
		font-weight: 600;
	}

	.pct-val {
		color: var(--primary);
	}

	.progress-bar-track {
		width: 100%;
		height: 8px;
		background-color: var(--border);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background-color: var(--primary);
		transition: width 0.2s ease;
	}

	.error-box {
		padding: 0.85rem;
		background-color: var(--danger-bg);
		color: var(--danger);
		border-radius: var(--radius-md);
		font-size: 0.9rem;
	}

	.action-buttons {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.console-box {
		background-color: #0b0f19;
		color: #10b981;
		border-radius: var(--radius-md);
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.console-header {
		background-color: #111827;
		padding: 0.4rem 0.75rem;
		color: #94a3b8;
		font-size: 0.75rem;
		border-bottom: 1px solid #1f2937;
	}

	.console-content {
		padding: 0.75rem;
		max-height: 180px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.result-card {
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

	.result-media-wrap {
		width: 100%;
		max-height: 250px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #000000;
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.result-media {
		max-width: 100%;
		max-height: 250px;
		object-fit: contain;
	}

	.audio-player {
		width: 100%;
		padding: 1rem;
	}

	.result-stats {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background-color: var(--bg-muted);
		padding: 0.85rem;
		border-radius: var(--radius-md);
		font-size: 0.88rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
	}

	.download-btn {
		width: 100%;
	}

	.placeholder-box {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.88rem;
	}

	.placeholder-icon {
		font-size: 2.5rem;
	}

	@media (max-width: 900px) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
