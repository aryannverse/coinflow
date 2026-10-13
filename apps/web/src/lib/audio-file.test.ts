import { describe, expect, it } from 'vitest'
import { audioFileName } from './audio-file'

describe('voice note upload name', () => {
  it('follows the recorder’s content type, so Groq reads the right format', () => {
    expect(audioFileName('audio/webm;codecs=opus')).toBe('voice.webm')
    expect(audioFileName('audio/ogg; codecs=opus')).toBe('voice.ogg')
    expect(audioFileName('audio/mp4')).toBe('voice.mp4')
    expect(audioFileName('audio/x-m4a')).toBe('voice.mp4')
    expect(audioFileName('audio/wav')).toBe('voice.wav')
    expect(audioFileName('AUDIO/WAVE')).toBe('voice.wav')
    expect(audioFileName('')).toBe('voice.webm') // MediaRecorder's usual default
  })
})
