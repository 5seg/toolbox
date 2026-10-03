/// <reference types="@cloudflare/workers-types" />

interface Env {
	ASSETS: Fetcher;
}

declare module 'cloudflare:sockets' {
	export interface SocketOptions {
		secureTransport?: 'off' | 'on' | 'starttls';
		allowHalfOpen?: boolean;
	}

	export interface SocketInfo {
		remoteAddress?: string;
		localAddress?: string;
	}

	export interface Socket {
		readonly readable: ReadableStream<Uint8Array>;
		readonly writable: WritableStream<Uint8Array>;
		readonly closed: Promise<void>;
		readonly opened: Promise<SocketInfo>;
		close(): Promise<void>;
		startTls(options?: { expectedServerHostname?: string }): Socket;
	}

	export function connect(
		address: string | { hostname: string; port: number },
		options?: SocketOptions
	): Socket;
}
