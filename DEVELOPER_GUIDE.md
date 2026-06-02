# VideoMind Developer Guide

This document describes the internal architecture of VideoMind.

---

## Vision

VideoMind converts raw video files into structured semantic data.

Goal:

```text
Video
 ↓
VideoMind
 ↓
VAF
 ↓
LLM Reasoning
 ↓
VideoForge Editing
```

VideoMind is not an editor.

VideoMind is an analysis engine.

---

## Current Pipeline

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

## Project Structure

```text
src/
│
├── core/
│   └── VideoMind.js
│
├── pipeline/
│   ├── SceneDetector.js
│   ├── FrameExtractor.js
│   ├── CollageGenerator.js
│   ├── AudioExtractor.js
│   └── LlmAnalyzer.js
│
├── utils/
│   └── TempManager.js
```

---

## Scene Detection

Uses FFmpeg scene-change detection.

Output:

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

## Frame Extraction

For every scene:

* Start Frame
* Middle Frame
* End Frame

Output:

```json
{
  "sceneId": 1,
  "frameType": "start",
  "timestamp": 0
}
```

---

## Collage Generation

Creates a timeline-oriented collage used for LLM visual understanding.

Current strategy:

```text
Scene 1
[Start][Middle][End]

Scene 2
[Start][Middle][End]
```

---

## Audio Extraction

Uses FFmpeg.

Output:

```text
audio.wav
```

Current purpose:

Future speech transcription and multimodal analysis.

---

## LLM Analysis

Current provider:

```text
OpenAI
```

Input:

* Scene JSON
* Collage Image

Output:

```json
{
  "video_analysis": {}
}
```

---

## VAF (Video Analysis Format)

VAF is the canonical VideoMind output.

Current VAF:

```json
{
  "video_analysis": {
    "sceneCount": 5,
    "scenes": []
  }
}
```

Future VAF:

```json
{
  "video": {},
  "scenes": [],
  "transcript": [],
  "people": [],
  "objects": [],
  "moments": [],
  "topics": []
}
```

---

## Temp File Strategy

Every analysis creates a unique job:

```text
tmp/
└── job_xxxxx/
```

Contains:

```text
frames/
audio.wav
collage.jpg
```

Deleted automatically unless:

```js
keepTempFiles: true
```

---

## Future Architecture

```text
Video
 ↓
VideoMind
 ↓
VAF
 ↓
VideoForge MCP
 ↓
Automated Editing
```

Planned additions:

* AssetScanner
* Batch Analysis
* Local Models
* YOLO Integration
* Speaker Diarization
* Advanced VAF Schema
* VideoForge Auto-Editing
