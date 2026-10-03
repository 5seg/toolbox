import { json, type RequestHandler } from '@sveltejs/kit';
import { validateHost } from '#lib/server/network-validation';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as Record<string, any>;
		const { target } = body;

		if (!target || typeof target !== 'string') {
			return json({ success: false, error: '計測対象のURLまたはホスト名を指定してください' }, { status: 400 });
		}

		let parsedUrl: URL;
		try {
			// If no protocol, default to https
			const urlString = /^https?:\/\//i.test(target) ? target : `https://${target}`;
			parsedUrl = new URL(urlString);
		} catch {
			return json({ success: false, error: 'URLの形式が正しくありません' }, { status: 400 });
		}

		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			return json({ success: false, error: 'HTTPまたはHTTPSのみ対応しています' }, { status: 400 });
		}

		// Validate hostname against private IPs and disallowed hosts
		const hostValidation = validateHost(parsedUrl.hostname);
		if (!hostValidation.valid) {
			return json({ success: false, error: hostValidation.error }, { status: 400 });
		}

		const startTime = performance.now();
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6000);

		let resStatus = 0;
		let resStatusText = '';
		let protocol = parsedUrl.protocol.replace(':', '').toUpperCase();
		let headersReceived: Record<string, string> = {};

		try {
			let response: Response;
			try {
				// Try HEAD first for lightweight measurement
				response = await fetch(parsedUrl.toString(), {
					method: 'HEAD',
					signal: controller.signal,
					headers: {
						'User-Agent': 'Cloudflare-Toolbox-PingBot/1.0'
					},
					// 検証済みホスト以外へ飛ばないよう、リダイレクトは追わずに 3xx をそのまま返す
					redirect: 'manual'
				});
			} catch (headErr: any) {
				// If HEAD is rejected by server (405 or 403 etc), try GET
				if (headErr.name === 'AbortError') throw headErr;
				response = await fetch(parsedUrl.toString(), {
					method: 'GET',
					signal: controller.signal,
					headers: {
						'User-Agent': 'Cloudflare-Toolbox-PingBot/1.0'
					},
					// 検証済みホスト以外へ飛ばないよう、リダイレクトは追わずに 3xx をそのまま返す
					redirect: 'manual'
				});
			}

			const duration = Math.round(performance.now() - startTime);
			resStatus = response.status;
			resStatusText = response.statusText;

			const serverHeader = response.headers.get('server');
			if (serverHeader) headersReceived['server'] = serverHeader;

			// Extract Cloudflare PoP (colo) from request if available
			const colo = (platform as any)?.cf?.colo || 'CF-Edge';

			return json({
				success: true,
				target: parsedUrl.toString(),
				hostname: parsedUrl.hostname,
				protocol,
				status: resStatus,
				statusText: resStatusText,
				rttMs: duration,
				edgeColo: colo,
				headers: headersReceived,
				timestamp: new Date().toISOString()
			});
		} catch (fetchErr: any) {
			const duration = Math.round(performance.now() - startTime);
			if (fetchErr.name === 'AbortError') {
				return json({
					success: false,
					error: 'リクエストがタイムアウトしました (6秒超過)',
					rttMs: duration
				}, { status: 504 });
			}
			return json({
				success: false,
				error: `接続に失敗しました: ${fetchErr?.message || 'ホスト名が解決できないか応答がありません'}`,
				rttMs: duration
			}, { status: 502 });
		} finally {
			clearTimeout(timeoutId);
		}
	} catch (err: any) {
		return json({
			success: false,
			error: err?.message || '予期しないエラーが発生しました'
		}, { status: 500 });
	}
};
