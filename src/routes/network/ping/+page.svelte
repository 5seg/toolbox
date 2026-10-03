<script lang="ts">
	// State for HTTP Ping
	let httpTarget = $state('https://1.1.1.1');
	let isCheckingHttp = $state(false);
	let httpHistory = $state<Array<{
		target: string;
		status: number;
		statusText: string;
		rttMs: number;
		edgeColo: string;
		timestamp: string;
		success: boolean;
		error?: string;
	}>>([]);

	// State for TCP Port Check
	let tcpHost = $state('1.1.1.1');
	let tcpPort = $state(443);
	let isCheckingPort = $state(false);
	let portHistory = $state<Array<{
		host: string;
		port: number;
		open: boolean;
		rttMs: number;
		edgeColo: string;
		message: string;
		timeout?: boolean;
		success: boolean;
		error?: string;
		timestamp: string;
	}>>([]);

	let activeTab = $state<'http' | 'tcp'>('http');

	const commonPorts = [
		{ port: 80, name: 'HTTP (80)' },
		{ port: 443, name: 'HTTPS (443)' },
		{ port: 22, name: 'SSH (22)' },
		{ port: 53, name: 'DNS (53)' },
		{ port: 8080, name: 'Web Alt (8080)' },
		{ port: 8443, name: 'HTTPS Alt (8443)' },
		{ port: 3306, name: 'MySQL (3306)' },
		{ port: 5432, name: 'PostgreSQL (5432)' },
		{ port: 6379, name: 'Redis (6379)' }
	];

	async function runHttpPing() {
		if (!httpTarget || isCheckingHttp) return;
		isCheckingHttp = true;

		try {
			const res = await fetch('/api/check-http', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ target: httpTarget })
			});

			const data = (await res.json()) as any;
			if (data.success) {
				httpHistory = [
					{
						target: data.target,
						status: data.status,
						statusText: data.statusText,
						rttMs: data.rttMs,
						edgeColo: data.edgeColo,
						timestamp: new Date().toLocaleTimeString(),
						success: true
					},
					...httpHistory.slice(0, 9)
				];
			} else {
				httpHistory = [
					{
						target: httpTarget,
						status: 0,
						statusText: '',
						rttMs: data.rttMs || 0,
						edgeColo: data.edgeColo || 'CF-Edge',
						timestamp: new Date().toLocaleTimeString(),
						success: false,
						error: data.error || '疎通に失敗しました'
					},
					...httpHistory.slice(0, 9)
				];
			}
		} catch (err: any) {
			httpHistory = [
				{
					target: httpTarget,
					status: 0,
					statusText: '',
					rttMs: 0,
					edgeColo: 'CF-Edge',
					timestamp: new Date().toLocaleTimeString(),
					success: false,
					error: err?.message || '通信エラーが発生しました'
				},
				...httpHistory.slice(0, 9)
			];
		} finally {
			isCheckingHttp = false;
		}
	}

	async function runPortCheck() {
		if (!tcpHost || !tcpPort || isCheckingPort) return;
		isCheckingPort = true;

		try {
			const res = await fetch('/api/check-port', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ host: tcpHost, port: Number(tcpPort) })
			});

			const data = (await res.json()) as any;
			if (data.success) {
				portHistory = [
					{
						host: data.hostname,
						port: data.port,
						open: data.open,
						rttMs: data.rttMs,
						edgeColo: data.edgeColo,
						message: data.message,
						timeout: data.timeout,
						success: true,
						timestamp: new Date().toLocaleTimeString()
					},
					...portHistory.slice(0, 9)
				];
			} else {
				portHistory = [
					{
						host: tcpHost,
						port: Number(tcpPort),
						open: false,
						rttMs: 0,
						edgeColo: 'CF-Edge',
						message: data.error || '検証に失敗しました',
						success: false,
						error: data.error,
						timestamp: new Date().toLocaleTimeString()
					},
					...portHistory.slice(0, 9)
				];
			}
		} catch (err: any) {
			portHistory = [
				{
					host: tcpHost,
					port: Number(tcpPort),
					open: false,
					rttMs: 0,
					edgeColo: 'CF-Edge',
					message: err?.message || '通信エラー',
					success: false,
					error: err?.message || '通信エラーが発生しました',
					timestamp: new Date().toLocaleTimeString()
				},
				...portHistory.slice(0, 9)
			];
		} finally {
			isCheckingPort = false;
		}
	}
</script>

<svelte:head>
	<title>サーバー疎通確認 (HTTP Ping / TCP Port) | Webツールボックス</title>
</svelte:head>

<div class="page-container">
	<div class="page-header">
		<a href="/" class="back-link">&larr; ツール一覧に戻る</a>
		<h1>🌐 サーバー疎通確認 (Workers API)</h1>
		<p class="page-desc">
			Cloudflare Workers のグローバルエッジサーバーから直接ターゲットホストへの疎通と応答時間を検証します。
		</p>
	</div>

	<!-- Notice box for ICMP restriction -->
	<div class="notice-card">
		<span class="notice-icon">ℹ️</span>
		<div class="notice-body">
			<strong>測定方式についてのご案内:</strong>
			<span>
				Cloudflare Workers のセキュリティ仕様上、通常の ICMP echo (OS標準の ping コマンド) は利用できません。本ツールでは <strong>HTTP/HTTPS リクエストの往復時間 (RTT)</strong> および <strong>TCP ソケット接続 (cloudflare:sockets)</strong> による代替計測を行っています。
			</span>
		</div>
	</div>

	<!-- Mode Switcher Tabs -->
	<div class="tabs-container">
		<button
			class="tab-btn"
			class:active={activeTab === 'http'}
			onclick={() => (activeTab = 'http')}
		>
			⚡ HTTP(S) 往復時間 (Ping代替)
		</button>
		<button
			class="tab-btn"
			class:active={activeTab === 'tcp'}
			onclick={() => (activeTab = 'tcp')}
		>
			🔌 TCP ポート疎通確認
		</button>
	</div>

	{#if activeTab === 'http'}
		<!-- HTTP RTT Section -->
		<div class="tool-content">
			<div class="input-card card">
				<h2 class="section-title">HTTP(S) 往復時間測定</h2>
				<p class="section-sub">
					対象サーバーへ HTTP HEAD リクエストを送信し、Cloudflare エッジからのレスポンス所要時間 (ms) を計測します。
				</p>

				<form class="form-row" onsubmit={(e) => { e.preventDefault(); runHttpPing(); }}>
					<div class="input-wrap">
						<label for="httpTargetInput" class="input-label">対象 URL または ホスト名</label>
						<input
							type="text"
							id="httpTargetInput"
							class="input"
							placeholder="例: https://cloudflare.com, 1.1.1.1, google.com"
							bind:value={httpTarget}
							disabled={isCheckingHttp}
						/>
					</div>
					<button type="submit" class="btn btn-primary submit-btn" disabled={isCheckingHttp}>
						{isCheckingHttp ? '計測中...' : '🚀 測定開始'}
					</button>
				</form>

				<div class="presets-row">
					<span class="preset-label">プリセット:</span>
					<button type="button" class="preset-chip" onclick={() => { httpTarget = 'https://1.1.1.1'; runHttpPing(); }}>Cloudflare DNS (1.1.1.1)</button>
					<button type="button" class="preset-chip" onclick={() => { httpTarget = 'https://8.8.8.8'; runHttpPing(); }}>Google DNS (8.8.8.8)</button>
					<button type="button" class="preset-chip" onclick={() => { httpTarget = 'https://github.com'; runHttpPing(); }}>GitHub</button>
				</div>
			</div>

			<!-- HTTP Results History -->
			{#if httpHistory.length > 0}
				<div class="results-card card">
					<h3 class="results-title">測定履歴</h3>
					<div class="history-list">
						{#each httpHistory as item}
							<div class="history-item" class:item-error={!item.success}>
								<div class="item-main">
									<div class="item-target">{item.target}</div>
									<div class="item-meta">
										<span>計測時刻: {item.timestamp}</span>
										<span>エッジ拠点: <strong>{item.edgeColo}</strong></span>
									</div>
								</div>

								<div class="item-status">
									{#if item.success}
										<span class="badge badge-success">HTTP {item.status} {item.statusText}</span>
										<span class="rtt-badge">{item.rttMs} ms</span>
									{:else}
										<span class="badge badge-danger">失敗</span>
										<span class="error-msg">{item.error}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<!-- TCP Port Section -->
		<div class="tool-content">
			<div class="input-card card">
				<h2 class="section-title">TCP ポート開放・疎通確認</h2>
				<p class="section-sub">
					Workers の TCP ソケット通信 API (cloudflare:sockets) を使い、指定ホストのポートが開いているかを安全に検証します。
				</p>

				<form class="form-row-tcp" onsubmit={(e) => { e.preventDefault(); runPortCheck(); }}>
					<div class="input-wrap flex-2">
						<label for="tcpHostInput" class="input-label">ホスト名 または パブリックIP</label>
						<input
							type="text"
							id="tcpHostInput"
							class="input"
							placeholder="例: example.com, 1.1.1.1"
							bind:value={tcpHost}
							disabled={isCheckingPort}
						/>
					</div>

					<div class="input-wrap flex-1">
						<label for="tcpPortInput" class="input-label">ポート番号 (1-65535)</label>
						<input
							type="number"
							id="tcpPortInput"
							class="input"
							min="1"
							max="65535"
							bind:value={tcpPort}
							disabled={isCheckingPort}
						/>
					</div>

					<button type="submit" class="btn btn-primary submit-btn" disabled={isCheckingPort}>
						{isCheckingPort ? '検証中...' : '🔍 ポート確認'}
					</button>
				</form>

				<!-- Port Presets -->
				<div class="presets-row">
					<span class="preset-label">主要ポート:</span>
					{#each commonPorts as p}
						<button
							type="button"
							class="preset-chip"
							class:active={tcpPort === p.port}
							onclick={() => (tcpPort = p.port)}
						>
							{p.name}
						</button>
					{/each}
				</div>

				<div class="security-info">
					🛡️ <strong>セキュリティ制限:</strong> プライベートIP (192.168.x, 10.x, 127.x, 172.16-31.x, 169.254.x)、ローカルホスト、およびスパム対策による25番ポート(SMTP)への接続はブロックされます。
				</div>
			</div>

			<!-- TCP Results History -->
			{#if portHistory.length > 0}
				<div class="results-card card">
					<h3 class="results-title">ポート検証履歴</h3>
					<div class="history-list">
						{#each portHistory as item}
							<div class="history-item" class:item-error={!item.success || !item.open}>
								<div class="item-main">
									<div class="item-target">
										{item.host}:{item.port}
									</div>
									<div class="item-meta">
										<span>時刻: {item.timestamp}</span>
										<span>エッジ: <strong>{item.edgeColo}</strong></span>
										<span class="item-desc">{item.message}</span>
									</div>
								</div>

								<div class="item-status">
									{#if item.success && item.open}
										<span class="badge badge-success">OPEN (接続成功)</span>
										<span class="rtt-badge">{item.rttMs} ms</span>
									{:else if item.success && !item.open}
										<span class="badge badge-warning">
											{item.timeout ? 'TIMEOUT' : 'CLOSED'}
										</span>
									{:else}
										<span class="badge badge-danger">拒否 / エラー</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
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

	.notice-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		background-color: var(--primary-light);
		border: 1px solid var(--border-active);
		border-radius: var(--radius-md);
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.notice-icon {
		font-size: 1.25rem;
		line-height: 1;
	}

	.notice-body strong {
		color: var(--primary);
	}

	.tabs-container {
		display: flex;
		border-bottom: 2px solid var(--border);
		gap: 1rem;
	}

	.tab-btn {
		background: none;
		border: none;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		position: relative;
		transition: color var(--transition-fast);
	}

	.tab-btn:hover {
		color: var(--text-primary);
	}

	.tab-btn.active {
		color: var(--primary);
	}

	.tab-btn.active::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 0;
		right: 0;
		height: 2px;
		background-color: var(--primary);
	}

	.tool-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.input-card {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.section-sub {
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	.form-row {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
	}

	.form-row-tcp {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
	}

	.input-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
	}

	.flex-2 { flex: 2; }
	.flex-1 { flex: 1; }

	.input-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.submit-btn {
		height: 42px;
		white-space: nowrap;
	}

	.presets-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.preset-label {
		color: var(--text-muted);
		font-weight: 500;
	}

	.preset-chip {
		background-color: var(--bg-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		padding: 0.25rem 0.65rem;
		font-size: 0.8rem;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.preset-chip:hover {
		background-color: var(--bg-card-hover);
		color: var(--text-primary);
	}

	.preset-chip.active {
		background-color: var(--primary);
		color: #ffffff;
		border-color: var(--primary);
	}

	.security-info {
		font-size: 0.82rem;
		color: var(--text-muted);
		background-color: var(--bg-muted);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		line-height: 1.5;
	}

	.results-card {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.results-title {
		font-size: 1.1rem;
		font-weight: 700;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.history-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.85rem 1.25rem;
		background-color: var(--bg-muted);
		border-radius: var(--radius-md);
		border-left: 4px solid var(--success);
		gap: 1rem;
	}

	.history-item.item-error {
		border-left-color: var(--danger);
	}

	.item-main {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		overflow: hidden;
	}

	.item-target {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--text-primary);
		font-family: var(--font-mono);
	}

	.item-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.item-desc {
		color: var(--text-secondary);
	}

	.item-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.rtt-badge {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--primary);
	}

	.error-msg {
		font-size: 0.82rem;
		color: var(--danger);
	}

	@media (max-width: 768px) {
		.form-row, .form-row-tcp {
			flex-direction: column;
			align-items: stretch;
		}

		.history-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.item-status {
			width: 100%;
			justify-content: space-between;
			margin-top: 0.5rem;
			padding-top: 0.5rem;
			border-top: 1px solid var(--border);
		}
	}
</style>
