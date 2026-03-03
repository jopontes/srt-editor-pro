export async function extractAudioFromVideo(videoFile) {
  // 1. Decode the original file to get the AudioBuffer
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await videoFile.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // 2. Downsample offline to 12000Hz mono to save bandwidth (enough for speech)
  const targetSampleRate = 12000;
  const targetChannels = 1;
  const offlineContext = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    targetChannels,
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate
  );

  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineContext.destination);
  bufferSource.start(0);

  const downsampledBuffer = await offlineContext.startRendering();
  
  // Return the buffer so caller can decide how to chunk it
  return downsampledBuffer;
}

export function audioBufferToWavBlob(buffer, startTime = 0, duration = null) {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const totalSamples = buffer.length;
  const sliceSamples = duration ? Math.floor(duration * sampleRate) : (totalSamples - startSample);
  
  const actualSamples = Math.min(sliceSamples, totalSamples - startSample);
  
  if (actualSamples <= 0) return null;

  const channelData = buffer.getChannelData(0);
  const slicedData = channelData.slice(startSample, startSample + actualSamples);

  const wavBytes = encodeWAV(slicedData, 1, sampleRate, 1, 16);
  return new Blob([wavBytes], { type: 'audio/wav' });
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample

  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)
  
  if (format === 1) { // Raw PCM
    floatTo16BitPCM(view, 44, samples)
  } else {
    // Should not happen with our use case
    for (let i = 0; i < samples.length; i++, offset += 4) {
      view.setFloat32(44 + i * 4, samples[i], true)
    }
  }

  return buffer
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

