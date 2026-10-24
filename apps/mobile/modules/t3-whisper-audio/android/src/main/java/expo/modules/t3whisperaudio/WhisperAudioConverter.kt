package expo.modules.t3whisperaudio

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.RandomAccessFile
import java.net.URI
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Decodes expo-audio's AAC to PCM16 WAV. whisper.rn handles channel mixing and resampling. */
internal object WhisperAudioConverter {
  fun convert(source: String, destination: String) {
    val inputFile = File(URI(source))
    val outputFile = File(URI(destination))
    val extractor = MediaExtractor()
    var decoder: MediaCodec? = null
    try {
      extractor.setDataSource(inputFile.path)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: error("The recording contains no audio.")
      val format = extractor.getTrackFormat(track)
      if (format.containsKey(MediaFormat.KEY_DURATION)) {
        require(format.getLong(MediaFormat.KEY_DURATION) <= 301_000_000L) { "Recording too long." }
      }
      extractor.selectTrack(track)
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
      val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      decoder = codec
      codec.configure(format, null, null, 0)
      codec.start()
      RandomAccessFile(outputFile, "rw").use { output ->
        output.setLength(0)
        output.write(ByteArray(44))
        val info = MediaCodec.BufferInfo()
        var inputFinished = false
        var outputFinished = false
        var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val deadline = System.nanoTime() + 60_000_000_000L
        while (!outputFinished) {
          check(System.nanoTime() < deadline) { "Audio conversion timed out." }
          if (!inputFinished) {
            val index = codec.dequeueInputBuffer(10_000)
            if (index >= 0) {
              val buffer = codec.getInputBuffer(index)!!
              val bytes = extractor.readSampleData(buffer, 0)
              if (bytes < 0) {
                codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputFinished = true
              } else {
                codec.queueInputBuffer(index, 0, bytes, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }
          val index = codec.dequeueOutputBuffer(info, 10_000)
          if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val decoded = codec.outputFormat
            sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            if (decoded.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
              require(decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_16BIT)
            }
          } else if (index >= 0) {
            try {
              if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                val buffer = codec.getOutputBuffer(index)!!
                buffer.position(info.offset)
                buffer.limit(info.offset + info.size)
                val bytes = ByteArray(info.size)
                buffer.get(bytes)
                output.write(bytes)
              }
              outputFinished = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            } finally {
              codec.releaseOutputBuffer(index, false)
            }
          }
        }
        val dataSize = (output.length() - 44).toInt()
        check(dataSize > 0) { "The recording is empty." }
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(dataSize + 36)
        header.put("WAVEfmt ".toByteArray()).putInt(16).putShort(1.toShort())
        header.putShort(channels.toShort()).putInt(sampleRate).putInt(sampleRate * channels * 2)
        header.putShort((channels * 2).toShort()).putShort(16.toShort())
        header.put("data".toByteArray()).putInt(dataSize)
        output.seek(0)
        output.write(header.array())
      }
    } finally {
      try {
        decoder?.release()
      } finally {
        extractor.release()
      }
    }
  }
}
