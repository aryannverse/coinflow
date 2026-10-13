const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'mp4',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

/** The voice note's upload name follows its content type: the speech provider infers the format from the extension. */
export function audioFileName(type: string): string {
  return `voice.${EXTENSIONS[type.split(';')[0].trim().toLowerCase()] ?? 'webm'}`
}
