# VideoMind

AI-powered video analysis library for Node.js.

VideoMind converts videos into structured semantic analysis files (VAF - Video Analysis Format) that can be consumed by AI agents, automation systems, and video editing platforms such as VideoForge.

---

# Features

* Scene Detection
* Representative Frame Extraction
* Timeline Collage Generation
* Audio Extraction
* AI-Powered Video Understanding
* VAF Generation
* Temporary Job Management
* OpenAI Integration
* Structured Video Analysis

---

# Installation

```bash
npm install videomind
```

Requirements:

* Node.js >= 18
* FFmpeg installed and available in PATH

---

# Environment Variables

Create `.env`

```env
LLM_PROVIDER=openai

OPENAI_API_KEY=YOUR_API_KEY

OPENAI_BASE_URL=https://api.openai.com/v1

TEXT_MODEL=gpt-4.1
VISION_MODEL=gpt-4.1
AUDIO_MODEL=gpt-4o-mini-transcribe
```

---

# Folder Structure

```text
assets/
│
├── videos/
│   ├── video1.mp4
│   └── video2.mp4
│
└── vaf/
```

Temporary files:

```text
tmp/
└── job_xxxxx/
```

---

# Quick Start

```js
import { VideoMind }
from "videomind";

const vm =
    new VideoMind({
        keepTempFiles: false
    });

const result =
    await vm.analyze(
        "./assets/videos/tutorial.mp4"
    );

console.log(result);
```

Output:

```json
{
  "video": "./assets/videos/tutorial.mp4",
  "vaf": "./assets/vaf/tutorial.vaf.json"
}
```

---

# API Reference

---

## VideoMind

Main entry point.

### Constructor

```js
const vm =
    new VideoMind(options);
```

### Options

| Option        | Type    | Default | Description                        |
| ------------- | ------- | ------- | ---------------------------------- |
| keepTempFiles | boolean | false   | Preserve temp files after analysis |

Example:

```js
const vm =
    new VideoMind({
        keepTempFiles: true
    });
```

---

## analyze()

Analyze a single video.

### Signature

```js
await vm.analyze(
    videoPath
);
```

### Parameters

| Name      | Type   | Description        |
| --------- | ------ | ------------------ |
| videoPath | string | Path to video file |

### Example

```js
await vm.analyze(
    "./assets/videos/demo.mp4"
);
```

### Returns

```json
{
  "video": "./assets/videos/demo.mp4",
  "vaf": "./assets/vaf/demo.vaf.json"
}
```

---

# Pipeline Components

These components can be used independently.

---

## SceneDetector

Detect scene changes using FFmpeg.

### Example

```js
import { SceneDetector }
from "videomind";

const detector =
    new SceneDetector(
        0.4
    );

const result =
    await detector.detect(
        "video.mp4"
    );
```

### Output

```json
{
  "sceneCount": 5,
  "scenes": [
    {
      "id": 1,
      "start": 0,
      "end": 9.83
    }
  ]
}
```

---

## FrameExtractor

Extract representative frames.

### Example

```js
import { FrameExtractor }
from "videomind";

const extractor =
    new FrameExtractor(
        "./frames"
    );

const frames =
    await extractor.extract(
        "video.mp4",
        scenes.scenes
    );
```

### Output

```json
{
  "frameCount": 15,
  "frames": [
    {
      "sceneId": 1,
      "frameType": "start",
      "timestamp": 0,
      "file": "..."
    }
  ]
}
```

---

## CollageGenerator

Generate timeline collage.

### Example

```js
import { CollageGenerator }
from "videomind";

const collage =
    new CollageGenerator({
        output:
            "./collage.jpg"
    });

await collage.generate(
    frames.frames
);
```

### Output

```text
collage.jpg
```

---

## AudioExtractor

Extract audio from video.

### Example

```js
import { AudioExtractor }
from "videomind";

const audio =
    new AudioExtractor(
        "./audio.wav"
    );

await audio.extract(
    "video.mp4"
);
```

### Output

```json
{
  "video": "video.mp4",
  "audio": "./audio.wav"
}
```

---

## LlmAnalyzer

Analyze scene data and visual timeline.

### Example

```js
import { LlmAnalyzer }
from "videomind";

const analyzer =
    new LlmAnalyzer();

const result =
    await analyzer.analyze({
        collagePath:
            "./collage.jpg",

        audioPath:
            "./audio.wav",

        sceneData:
            scenes
    });
```

### Output

```json
{
  "video_analysis": {
    "sceneCount": 5
  }
}
```

---

## TempManager

Manage temporary jobs.

### Create Job

```js
import { TempManager }
from "videomind";

const temp =
    new TempManager();

const job =
    temp.createJob();
```

### Output

```js
{
    id,
    path,
    framesPath,
    audioPath,
    collagePath
}
```

---

### Delete Job

```js
temp.cleanJob(
    job.path
);
```

---

### Delete All Temp Files

```js
temp.cleanAll();
```

---

# Video Analysis Format (VAF)

Current schema:

```json
{
  "video_analysis": {
    "sceneCount": 5,
    "scenes": []
  }
}
```

Future schema:

```json
{
  "video": {},
  "scenes": [],
  "people": [],
  "objects": [],
  "transcript": [],
  "moments": [],
  "topics": []
}
```

---

# Current Processing Flow

```text
Video
 ↓
SceneDetector
 ↓
FrameExtractor
 ↓
CollageGenerator
 ↓
AudioExtractor
 ↓
LlmAnalyzer
 ↓
VAF
```

---

# Example Full Workflow

```js
import { VideoMind }
from "videomind";

const vm =
    new VideoMind({
        keepTempFiles: false
    });

const result =
    await vm.analyze(
        "./assets/videos/main.mp4"
    );

console.log(result);
```

Generated:

```text
assets/
│
├── videos/
│   └── main.mp4
│
└── vaf/
    └── main.vaf.json
```

---

# Roadmap

* [x] Scene Detection
* [x] Frame Extraction
* [x] Timeline Collage
* [x] Audio Extraction
* [x] OpenAI Analysis
* [x] VAF Generation

Planned:

* [ ] Batch Asset Analysis
* [ ] analyzeAssets()
* [ ] AssetScanner
* [ ] Speaker Detection
* [ ] YOLO Integration
* [ ] Object Detection
* [ ] Emotion Detection
* [ ] Local LLM Support
* [ ] VideoForge Integration
* [ ] Automated Editing

---

# License

MIT
