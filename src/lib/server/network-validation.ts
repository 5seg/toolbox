// Network input validation and security filters to prevent SSRF and abuse

const BLOCKED_HOST_PATTERNS = [
	/^localhost$/i,
	/\.localhost$/i,
	/\.local$/i,
	/\.internal$/i,
	/\.lan$/i,
	/\.home\.arpa$/i,
	/\.invalid$/i,
	/\.test$/i,
	/\.example$/i,
	/^metadata\.google\.internal$/i
];

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
		return false;
	}

	const [a, b, c, d] = parts;

	// 0.0.0.0/8
	if (a === 0) return true;
	// 10.0.0.0/8
	if (a === 10) return true;
	// 127.0.0.0/8 (Loopback)
	if (a === 127) return true;
	// 100.64.0.0/10 (Carrier-grade NAT)
	if (a === 100 && b >= 64 && b <= 127) return true;
	// 169.254.0.0/16 (Link Local / Metadata)
	if (a === 169 && b === 254) return true;
	// 172.16.0.0/12 (Private Class B)
	if (a === 172 && b >= 16 && b <= 31) return true;
	// 192.0.0.0/24 (IETF Protocol)
	if (a === 192 && b === 0 && c === 0) return true;
	// 192.0.2.0/24 (TEST-NET-1)
	if (a === 192 && b === 0 && c === 2) return true;
	// 192.168.0.0/16 (Private Class C)
	if (a === 192 && b === 168) return true;
	// 198.18.0.0/15 (Benchmark)
	if (a === 198 && (b === 18 || b === 19)) return true;
	// 198.51.100.0/24 (TEST-NET-2)
	if (a === 198 && b === 51 && c === 100) return true;
	// 203.0.113.0/24 (TEST-NET-3)
	if (a === 203 && b === 0 && c === 113) return true;
	// 224.0.0.0/4 (Multicast)
	if (a >= 224 && a <= 239) return true;
	// 240.0.0.0/4 (Reserved / Future)
	if (a >= 240) return true;

	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const normalized = ip.toLowerCase().trim();
	if (normalized === '::1' || normalized === '::') return true;
	// Unique Local (fc00::/7)
	if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
	// Link Local (fe80::/10)
	if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
	// Multicast (ff00::/8)
	if (normalized.startsWith('ff')) return true;
	// IPv4-mapped (::ffff:...)
	if (normalized.includes('::ffff:')) {
		const parts = normalized.split(':');
		const lastPart = parts[parts.length - 1];
		if (lastPart.includes('.')) {
			return isPrivateIPv4(lastPart);
		}
	}
	return false;
}

export function validateHost(host: string): { valid: boolean; error?: string; cleanHost?: string } {
	if (!host || typeof host !== 'string') {
		return { valid: false, error: 'ホスト名またはIPアドレスを入力してください' };
	}

	let clean = host.trim().toLowerCase();
	// Remove protocol prefix if user pasted full URL
	clean = clean.replace(/^[a-z]+:\/\//, '');
	// Remove port if included
	clean = clean.split('/')[0];
	clean = clean.split(':')[0];

	if (clean.length === 0 || clean.length > 253) {
		return { valid: false, error: 'ホスト名の長さが無効です (1〜253文字)' };
	}

	// Block disallowed patterns
	for (const pattern of BLOCKED_HOST_PATTERNS) {
		if (pattern.test(clean)) {
			return { valid: false, error: '内部ホストやローカルアドレスへの接続はセキュリティのため制限されています' };
		}
	}

	// Check IPv4
	const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
	if (ipv4Regex.test(clean)) {
		if (isPrivateIPv4(clean)) {
			return { valid: false, error: 'プライベートIPアドレスおよび特殊アドレス(10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x等)への接続は制限されています' };
		}
		return { valid: true, cleanHost: clean };
	}

	// Check IPv6
	if (clean.includes(':')) {
		if (isPrivateIPv6(clean)) {
			return { valid: false, error: 'プライベートIPv6アドレス(::1, fe80::, fc00::等)への接続は制限されています' };
		}
		return { valid: true, cleanHost: clean };
	}

	// Domain name validation
	const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
	if (!domainRegex.test(clean)) {
		return { valid: false, error: '有効なドメイン名 (例: example.com) またはパブリックIPアドレスを入力してください' };
	}

	return { valid: true, cleanHost: clean };
}

export function validatePort(port: number | string): { valid: boolean; error?: string; cleanPort?: number } {
	const num = typeof port === 'number' ? port : parseInt(port, 10);
	if (isNaN(num) || num < 1 || num > 65535) {
		return { valid: false, error: 'ポート番号は1から65535の範囲で指定してください' };
	}

	// Spam / dangerous port restriction
	if (num === 25) {
		return { valid: false, error: '迷惑メール・スパム防止のためポート25(SMTP)への接続は制限されています' };
	}

	return { valid: true, cleanPort: num };
}
