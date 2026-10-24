#!/bin/bash
set -euo pipefail
module_dir=$(cd "$(dirname "$0")/.." && pwd)
output=$(mktemp -d)
trap 'rm -rf "$output"' EXIT
xcrun swiftc "$module_dir/ios/WhisperAudioConverter.swift" "$module_dir/tests/audio/main.swift" \
  -o "$output/audio-tests"
"$output/audio-tests"
