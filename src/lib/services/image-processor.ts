// Helper for interacting with the image processing Web Worker
import type { ImageProcessRequest, ImageProcessResponse } from '#lib/workers/image.worker';

let workerInstance: Worker | null = null;
const pendingRequests = new Map<string, {
	resolve: (res: ImageProcessResponse) => void;
	reject: (err: any) => void;
}>();

function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker(new URL('../workers/image.worker.ts', import.meta.url), {
			type: 'module'
		});

		workerInstance.onmessage = (e: MessageEvent<ImageProcessResponse>) => {
			const { id } = e.data;
			const handler = pendingRequests.get(id);
			if (handler) {
				pendingRequests.delete(id);
				if (e.data.success) {
					handler.resolve(e.data);
				} else {
					handler.reject(new Error(e.data.error || '画像処理に失敗しました'));
				}
			}
		};

		workerInstance.onerror = (err) => {
			console.error('Image Worker error:', err);
		};
	}
	return workerInstance;
}

export interface ProcessImageOptions {
	format: 'webp' | 'jpeg' | 'png' | 'avif';
	quality?: number; // 1 - 100
	targetWidth?: number;
	targetHeight?: number;
}

export async function processImageWithWorker(
	file: File | Blob,
	options: ProcessImageOptions
): Promise<{
	blob: Blob;
	url: string;
	width: number;
	height: number;
	originalSize: number;
	newSize: number;
	mimeType: string;
	extension: string;
}> {
	const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
	const fileData = await file.arrayBuffer();

	try {
		const worker = getWorker();
		const responsePromise = new Promise<ImageProcessResponse>((resolve, reject) => {
			pendingRequests.set(id, { resolve, reject });
		});

		const req: ImageProcessRequest = {
			id,
			fileData,
			format: options.format,
			quality: options.quality,
			targetWidth: options.targetWidth,
			targetHeight: options.targetHeight
		};

		worker.postMessage(req, [fileData]);
		const res = await responsePromise;

		if (!res.buffer || !res.mimeType) {
			throw new Error('処理結果のバッファが空です');
		}

		const blob = new Blob([res.buffer], { type: res.mimeType });
		const url = URL.createObjectURL(blob);

		return {
			blob,
			url,
			width: res.width || 0,
			height: res.height || 0,
			originalSize: res.originalSize || file.size,
			newSize: res.newSize || blob.size,
			mimeType: res.mimeType,
			extension: res.extension || 'jpg'
		};
	} catch (workerErr: any) {
		console.warn('Worker process failed, attempting canvas fallback:', workerErr);
		return await fallbackCanvasProcess(file, options);
	}
}

async function fallbackCanvasProcess(file: File | Blob, options: ProcessImageOptions) {
	const img = new Image();
	const objUrl = URL.createObjectURL(file);
	await new Promise((resolve, reject) => {
		img.onload = resolve;
		img.onerror = reject;
		img.src = objUrl;
	});

	const targetWidth = options.targetWidth && options.targetWidth > 0 ? options.targetWidth : img.naturalWidth;
	const targetHeight = options.targetHeight && options.targetHeight > 0 ? options.targetHeight : img.naturalHeight;

	const canvas = document.createElement('canvas');
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
	URL.revokeObjectURL(objUrl);

	let mimeType = 'image/jpeg';
	let extension = 'jpg';
	if (options.format === 'png') {
		mimeType = 'image/png';
		extension = 'png';
	} else if (options.format === 'webp') {
		mimeType = 'image/webp';
		extension = 'webp';
	} else if (options.format === 'avif') {
		mimeType = 'image/avif';
		extension = 'avif';
	}

	const quality = (options.quality ?? 80) / 100;
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => {
			if (b) resolve(b);
			else reject(new Error('Canvas toBlob failed'));
		}, mimeType, quality);
	});

	const url = URL.createObjectURL(blob);
	return {
		blob,
		url,
		width: targetWidth,
		height: targetHeight,
		originalSize: file.size,
		newSize: blob.size,
		mimeType,
		extension
	};
}

export function formatBytes(bytes: number, decimals = 1): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
