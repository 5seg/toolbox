import { json, type RequestHandler } from '@sveltejs/kit';
import { validateHost, validatePort } from '#lib/server/network-validation';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as Record<string, any>;
		const { host, port } = body;

		const hostCheck = validateHost(host);
		if (!hostCheck.valid || !hostCheck.cleanHost) {
			return json({ success: false, error: hostCheck.error || '無効なホストです' }, { status: 400 });
		}

		const portCheck = validatePort(port);
		if (!portCheck.valid || !portCheck.cleanPort) {
			return json({ success: false, error: portCheck.error || '無効なポートです' }, { status: 400 });
		}

		const cleanHost = hostCheck.cleanHost;
		const cleanPort = portCheck.cleanPort;
		const timeoutMs = 4000;
		const startTime = performance.now();

		let connected = false;
		let timeoutOccurred = false;
		let errorMessage = '';

		// Check if we are running in Cloudflare Workers environment with cloudflare:sockets
		let socketsModule: any = null;
		try {
			socketsModule = await import('cloudflare:sockets');
		} catch {
			// Not available in standard Node.js dev mode
		}

		if (socketsModule && typeof socketsModule.connect === 'function') {
			let socket: any = null;
			try {
				socket = socketsModule.connect({ hostname: cleanHost, port: cleanPort });

				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => {
						timeoutOccurred = true;
						reject(new Error('TIMEOUT'));
					}, timeoutMs);
				});

				// Wait for socket to open
				await Promise.race([socket.opened, timeoutPromise]);
				connected = true;
			} catch (socketErr: any) {
				if (socketErr?.message === 'TIMEOUT' || timeoutOccurred) {
					errorMessage = '接続がタイムアウトしました (4秒超過。ファイアウォールで遮断されているか応答がありません)';
				} else {
					errorMessage = socketErr?.message || '接続が拒否されました (ポートが閉じている可能性があります)';
				}
			} finally {
				if (socket) {
					try {
						await socket.close();
					} catch {
						// ignore close errors
					}
				}
			}
		} else {
			// Dev environment fallback using Node.js net module
			try {
				// @ts-ignore
				const net = await import('node:net' as any);
				await new Promise<void>((resolve, reject) => {
					const client = new net.Socket();
					client.setTimeout(timeoutMs);

					client.connect(cleanPort, cleanHost, () => {
						connected = true;
						client.destroy();
						resolve();
					});

					client.on('timeout', () => {
						timeoutOccurred = true;
						client.destroy();
						reject(new Error('TIMEOUT'));
					});

					client.on('error', (err: any) => {
						client.destroy();
						reject(err);
					});
				});
			} catch (devErr: any) {
				if (devErr?.message === 'TIMEOUT' || timeoutOccurred) {
					errorMessage = '接続がタイムアウトしました (4秒超過)';
				} else {
					errorMessage = devErr?.message || '接続に失敗しました';
				}
			}
		}

		const rttMs = Math.round(performance.now() - startTime);
		const colo = (platform as any)?.cf?.colo || 'CF-Edge';

		if (connected) {
			return json({
				success: true,
				open: true,
				hostname: cleanHost,
				port: cleanPort,
				rttMs,
				edgeColo: colo,
				message: `ポート ${cleanPort} は開放されており、TCP接続に成功しました。`
			});
		} else {
			return json({
				success: true,
				open: false,
				hostname: cleanHost,
				port: cleanPort,
				rttMs,
				edgeColo: colo,
				timeout: timeoutOccurred,
				message: errorMessage || `ポート ${cleanPort} への接続が成立しませんでした。`
			});
		}
	} catch (err: any) {
		return json({
			success: false,
			error: err?.message || 'TCPポート検証中にエラーが発生しました'
		}, { status: 500 });
	}
};
