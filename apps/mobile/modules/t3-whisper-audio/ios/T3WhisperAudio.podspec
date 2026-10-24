Pod::Spec.new do |s|
  s.name = 'T3WhisperAudio'
  s.version = '1.0.0'
  s.summary = 'Local audio conversion for T3 Code dictation.'
  s.description = 'Converts recorded audio to PCM WAV for on-device Whisper transcription.'
  s.author = 'T3 Tools'
  s.homepage = 'https://t3tools.com'
  s.platforms = { :ios => '18.0' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
