import { fitWithin } from './upload-limits'

const JPEG_QUALITY = 0.85

type Decoded = { width: number; height: number; source: CanvasImageSource; close?: () => void }
/** How the browser decodes and re-encodes a photo; injected so the size logic is testable without a canvas. */
export type ImageCodec = {
  decode(file: Blob): Promise<Decoded>
  encode(source: CanvasImageSource, size: { width: number; height: number }, type: string, quality: number): Promise<Blob | null>
}

export const browserCodec: ImageCodec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
  },
  async encode(source, { width, height }, type, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, width, height)
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  },
}

/**
 * Spec §10: phone photos are often 5–12 MB, over Vercel's 4.5 MB body limit. Redraw the receipt with its longest side at
 * most 2,000 px as JPEG 0.85 (plenty for reading line items). If the browser can't (an unsupported format), or the
 * result is no smaller, the original goes, and the caller's 4 MB check decides.
 */
export async function downscaleForUpload(file: File, codec: ImageCodec = browserCodec): Promise<File> {
  let decoded: Decoded | null = null
  try {
    decoded = await codec.decode(file)
    const blob = await codec.encode(decoded.source, fitWithin(decoded.width, decoded.height), 'image/jpeg', JPEG_QUALITY)
    if (!blob || blob.size === 0 || blob.size >= file.size) return file
    return new File([blob], file.name || 'receipt.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    decoded?.close?.()
  }
}
