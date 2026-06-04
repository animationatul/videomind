# VideoMind

AI-powered video analysis library for Node.js.

VideoMind converts any video into a structured **VAF (Video Analysis Format)** file — a rich JSON document capturing the full timeline, transcription, speakers, speech events, shot types, camera metadata, and visual descriptions. VAF files are designed to be consumed by LLMs and automated editing tools.

---

## Features

- **Audio Extraction** — FFmpeg-based 16kHz mono WAV extraction
- **Speech Transcription** — OpenAI audio API with word-level timestamps
- **Speaker Detection** — LLM-based speaker labeling (Speaker A, Speaker B, ...)
- **Speech Event Analysis** — Detects stammers, fillers, false starts, retakes, em-dashes, long pauses, and breaths — each with precise `start`/`end` timestamps
- **Visual Scene Detection** — FFmpeg scene-change filter with configurable sensitivity
- **Video Metadata** — Resolution, FPS, duration, audio presence via FFprobe
- **Timeline Merging** — Unified timeline from audio segments + visual scenes
- **Frame Extraction** — 3 frames per segment (start, middle, end) at any FPS
- **Timeline Collage** — Visual timeline image with speaker and dialogue labels
- **LLM Visual Analysis** — Shot type, camera angle, camera movement, audio type, and visual description per segment
- **VAF Generation** — Fully structured JSON output ready for LLM-based editing tools
- **Batch Processing** — Analyze entire folders with skip-existing support
- **Configurable Paths** — Set video input and VAF output to any folder on the machine

---

## Requirements

- Node.js >= 18
- FFmpeg + FFprobe installed and available in `PATH`
- OpenAI API key

**Install FFmpeg**

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

---

## Installation

```bash
npm install videomind
```

---

## Environment Setup

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
LLM_PROVIDER=openai

OPENAI_API_KEY=sk-proj-...
OPENAI_BASE_URL=https://api.openai.com/v1

TEXT_MODEL=gpt-4.1
VISION_MODEL=gpt-4.1
AUDIO_MODEL=gpt-4o-mini-transcribe
```

---

## Quick Start

**Analyze a single video**

```js
import { VideoMind } from "videomind";

const vm = new VideoMind();

const result = await vm.analyze("./assets/videos/tutorial.mp4");

console.log(result);
// { video: "./assets/videos/tutorial.mp4", vaf: "./assets/vaf/tutorial.vaf.json" }
```

**Analyze from a custom folder**

```js
import { VideoMind } from "videomind";

const vm = new VideoMind()
    .setVideoFolder("/media/recordings")
    .setVafFolder("/media/output");

await vm.analyzeAssets();
```

**Batch process entire folder**

```js
import { VideoMind } from "videomind";

const vm = new VideoMind()
    .setVideoFolder("./raw-footage");

const summary = await vm.analyzeAssets({ overwrite: false });

console.log(`Processed: ${summary.processed}/${summary.total}`);
```

---

## Pipeline

```
Video File
    │
    ├─[1] AudioExtractor
    │       video → audio.wav (16kHz mono)
    │
    ├─[2] TranscriptExtractor          ┐
    │       audio.wav → LLM            │  parallel
    │       → segments, speakers,      │
    │         speech events            │
    │                                  │
    ├─[3] SceneDetector + Metadata     ┘
    │       video → FFmpeg
    │       → visual scene boundaries
    │       → resolution, fps, duration
    │
    ├─[4] TimelineMerger
    │       audio segments + visual scenes → unified timeline
    │
    ├─[5] FrameExtractor
    │       timeline → 3 frames per segment (start / middle / end)
    │
    ├─[6] CollageGenerator
    │       frames → single timeline collage JPEG
    │       (rows = segments, labeled with speaker + dialogue)
    │
    └─[7] LlmAnalyzer
            collage + timeline context → LLM
            → description, shot_type, camera_angle,
              camera_movement, audio_type, content_type, summary
            → complete VAF JSON
```

Steps 2 and 3 run in parallel — scene detection and transcription are independent of each other.

---

## VAF Output

The `.vaf.json` file contains the full analysis of the video:

```json
{
  "video": "tutorial.mp4",
  "duration": 142.5,
  "resolution": "1920x1080",
  "fps": 30,
  "has_audio": true,
  "has_speech": true,
  "language": "en",
  "content_type": "tutorial",
  "speakers": ["Speaker A"],
  "scene_count": 4,
  "timeline": [
    {
      "index": 1,
      "start": 0.0,
      "end": 8.3,
      "duration": 8.3,
      "description": "Presenter at desk, browser visible on screen behind",
      "shot_type": "medium_shot",
      "camera_angle": "eye_level",
      "camera_movement": "static",
      "audio_type": "speech",
      "speaker": "Speaker A",
      "dialogue": "Let me show you how the settings panel works.",
      "raw_dialogue": "Let me— let me show you um how the settings panel works.",
      "speech_events": [
        { "type": "false_start", "start": 0.8, "end": 1.0, "text": "Let me—" },
        { "type": "filler",      "start": 3.2, "end": 3.5, "text": "um" }
      ],
      "has_speech_issues": true
    }
  ],
  "summary": "A tutorial walking through dashboard settings configuration."
}
```

VAF works for any video type — tutorials, interviews, documentaries, music videos, screen recordings, or silent content. Fields like `speaker`, `dialogue`, and `speech_events` are `null` / `[]` when not applicable.

---

## Folder Structure

Default layout (customizable via `setVideoFolder` / `setVafFolder`):

```
assets/
├── videos/          ← input video files
│   ├── tutorial.mp4
│   └── interview.mp4
└── vaf/             ← generated VAF files
    ├── tutorial.vaf.json
    └── interview.vaf.json

tmp/
└── job_xxxxx/       ← temp files (auto-deleted after analysis)
    ├── frames/
    ├── audio.wav
    └── collage.jpg
```

---

## API Overview

| Method | Description |
|---|---|
| `new VideoMind(options?)` | Create instance |
| `.setVideoFolder(path)` | Set input folder |
| `.setVafFolder(path)` | Set output folder |
| `.analyze(videoPath)` | Analyze one video |
| `.analyzeAssets(options?)` | Batch analyze folder |

For full details see [API.md](./API.md).

---

## Supported Formats

| Format | Extension |
|---|---|
| MP4 | `.mp4` |
| QuickTime | `.mov` |
| Matroska | `.mkv` |
| AVI | `.avi` |
| WebM | `.webm` |

Any frame rate (24fps, 30fps, 60fps, etc.) is supported. All timestamps are in seconds.

---

## Roadmap

**Completed**

- [x] Audio extraction
- [x] OpenAI speech transcription with word timestamps
- [x] Speaker labeling
- [x] Speech event detection (stammers, fillers, false starts, retakes, pauses)
- [x] Visual scene detection
- [x] Video metadata extraction (resolution, FPS, duration)
- [x] Timeline merging (audio + visual)
- [x] Frame extraction (any FPS)
- [x] Timeline collage generation
- [x] LLM visual analysis (shot type, camera angle, movement)
- [x] Full VAF generation
- [x] Batch asset processing
- [x] Configurable input/output folders

**Planned**

- [ ] Local LLM support (Ollama)
- [ ] Google / Anthropic provider support
- [ ] Object detection (YOLO integration)
- [ ] Emotion detection
- [ ] Face / person tracking
- [ ] VideoForge MCP auto-editing integration

---

## License

VideoMind is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See [LICENSE](./LICENSE) for the full license text.
