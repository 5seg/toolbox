// Web Worker for image encoding and decoding using @jsquash WebAssembly codecs
import encodeJpeg from '@jsquash/jpeg/encode';
import decodeJpeg from '@jsquash/jpeg/decode';
import encodePng from '@jsquash/png/encode';
import decodePng from '@jsquash/png/decode';
import encodeWebp from '@jsquash/webp/encode';
import decodeWebp from '@jsquash/webp/decode';
import encodeAvif from '@jsquash/avif/encode';
import decodeAvif from '@jsquash/avif/decode';

export interface ImageProcessRequest {
	id: string;
	fileData: ArrayBuffer;
	format: 'webp' | 'jpeg' | 'png' | 'avif';
	quality?: number; // 1 - 100
	targetWidth?: number;
	targetHeight?: number;
}

export interface ImageProcessResponse {
	id: string;
	success: boolean;
	buffer?: ArrayBuffer;
	mimeType?: string;
	extension?: string;
	width?: number;
	height?: number;
	originalSize?: number;
	newSize?: number;
	error?: string;
}

self.onmessage = async (e: MessageEvent<ImageProcessRequest>) => {
	const req = e.data;
	try {
		const originalSize = req.fileData.byteLength;
		let imageData: ImageData | null = null;
		let originalWidth = 0;
		let originalHeight = 0;

		// 1. Try decoding with native createImageBitmap & OffscreenCanvas
		try {
			const blob = new Blob([req.fileData]);
			const bitmap = await createImageBitmap(blob);
			originalWidth = bitmap.width;
			originalHeight = bitmap.height;

			const targetWidth = req.targetWidth && req.targetWidth > 0 ? req.targetWidth : originalWidth;
			const targetHeight = req.targetHeight && req.targetHeight > 0 ? req.targetHeight : originalHeight;

			const canvas = new OffscreenCanvas(targetWidth, targetHeight);
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('OffscreenCanvas 2D context not available');

			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
			imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
			bitmap.close();
		} catch (bitmapErr) {
			// Fallback: try decoding with @jsquash decoders
			const decoders = [
				{ name: 'jpeg', fn: decodeJpeg },
				{ name: 'png', fn: decodePng },
				{ name: 'webp', fn: decodeWebp },
				{ name: 'avif', fn: decodeAvif }
			];

			for (const { fn } of decoders) {
				try {
					imageData = await fn(req.fileData.slice(0));
					if (imageData) {
						originalWidth = imageData.width;
						originalHeight = imageData.height;
						break;
					}
				} catch {
					// continue
				}
			}

			if (!imageData) {
				throw new Error('画像の読み込み・デコードに失敗しました。対応していない画像形式の可能性があります。');
			}

			// If resizing is needed and decoding came from fallback
			const targetWidth = req.targetWidth && req.targetWidth > 0 ? req.targetWidth : originalWidth;
			const targetHeight = req.targetHeight && req.targetHeight > 0 ? req.targetHeight : originalHeight;

			if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
				const canvas = new OffscreenCanvas(originalWidth, originalHeight);
				const ctx = canvas.getContext('2d')!;
				ctx.putImageData(imageData, 0, 0);

				const resizedCanvas = new OffscreenCanvas(targetWidth, targetHeight);
				const resizedCtx = resizedCanvas.getContext('2d')!;
				resizedCtx.imageSmoothingEnabled = true;
				resizedCtx.imageSmoothingQuality = 'high';
				resizedCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
				imageData = resizedCtx.getImageData(0, 0, targetWidth, targetHeight);
			}
		}

		if (!imageData) {
			throw new Error('画像データの取得に失敗しました');
		}

		// 2. Encode to target format using @jsquash WASM
		const quality = req.quality ?? 80;
		let outputBuffer: ArrayBuffer;
		let mimeType = 'image/jpeg';
		let extension = 'jpg';

		switch (req.format) {
			case 'jpeg': {
				outputBuffer = await encodeJpeg(imageData, { quality });
				mimeType = 'image/jpeg';
				extension = 'jpg';
				break;
			}
			case 'png': {
				outputBuffer = await encodePng(imageData);
				mimeType = 'image/png';
				extension = 'png';
				break;
			}
			case 'webp': {
				outputBuffer = await encodeWebp(imageData, { quality });
				mimeType = 'image/webp';
				extension = 'webp';
				break;
			}
			case 'avif': {
				outputBuffer = await encodeAvif(imageData, { quality });
				mimeType = 'image/avif';
				extension = 'avif';
				break;
			}
			default:
				throw new Error(`未対応の画像形式です: ${req.format}`);
		}

		const response: ImageProcessResponse = {
			id: req.id,
			success: true,
			buffer: outputBuffer,
			mimeType,
			extension,
			width: imageData.width,
			height: imageData.height,
			originalSize,
			newSize: outputBuffer.byteLength
		};

		// Transfer buffer back to avoid copy overhead
		(self as any).postMessage(response, [outputBuffer]);
	} catch (err: any) {
		const response: ImageProcessResponse = {
			id: req.id,
			success: false,
			error: err?.message || '画像処理中にエラーが発生しました'
		};
		(self as any).postMessage(response);
	}
};
