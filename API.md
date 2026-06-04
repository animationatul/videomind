# VideoMind — API Reference

Complete developer reference for all classes, methods, types, and output schemas.

---

## Table of Contents

- [VideoMind](#videomind)
  - [Constructor](#constructor)
  - [setVideoFolder()](#setvideofolder)
  - [setVafFolder()](#setvaffolder)
  - [analyze()](#analyze)
  - [analyzeAssets()](#analyzeassets)
- [Pipeline Components](#pipeline-components)
  - [AudioExtractor](#audioextractor)
  - [TranscriptExtractor](#transcriptextractor)
  - [SceneDetector](#scenedetector)
  - [TimelineMerger](#timelinemerger)
  - [FrameExtractor](#frameextractor)
  - [CollageGenerator](#collagegenerator)
  - [LlmAnalyzer](#llmanalyzer)
- [Utilities](#utilities)
  - [TempManager](#tempmanager)
- [VAF Schema](#vaf-schema)
  - [Top-Level Fields](#top-level-fields)
  - [Timeline Segment](#timeline-segment)
  - [SpeechEvent](#speechevent)
- [Type Reference](#type-reference)
- [Environment Variables](#environment-variables)
- [Error Handling](#error-handling)

---

## VideoMind

The main orchestrator class. Runs the full pipeline and produces the VAF file.

```js
import { VideoMind } from "videomind";
```

---

### Constructor

```js
new VideoMind(options?)
```

**Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `options` | `object` | `{}` | Optional configuration |
| `options.keepTempFiles` | `boolean` | `false` | Keep `tmp/job_xxxxx/` directories after analysis |

**Defaults**

| Property | Default Value |
|---|---|
| `videoFolder` | `./assets/videos` |
| `vafFolder` | `./assets/vaf` |

**Example**

```js
// Default setup
const vm = new VideoMind();

// Keep temp files for debugging
const vm = new VideoMind({ keepTempFiles: true });
```

---

### setVideoFolder()

Set the folder VideoMind reads videos from. Accepts any absolute or relative path on the machine.

```js
vm.setVideoFolder(folderPath)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `folderPath` | `string` | Absolute or relative path to the video folder |

**Returns** `this` — chainable

**Example**

```js
const vm = new VideoMind();

// Absolute path
vm.setVideoFolder("/home/user/projects/videos");

// Relative path
vm.setVideoFolder("../raw-footage");

// Chained
const vm = new VideoMind()
    .setVideoFolder("/media/drive/footage")
    .setVafFolder("/media/drive/output");
```

---

### setVafFolder()

Set the folder where `.vaf.json` output files are saved.

```js
vm.setVafFolder(folderPath)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `folderPath` | `string` | Absolute or relative path to the output folder |

**Returns** `this` — chainable

**Example**

```js
vm.setVafFolder("/home/user/projects/analysis");

// Chain with setVideoFolder
const vm = new VideoMind()
    .setVideoFolder("/footage")
    .setVafFolder("/output/vaf");
```

---

### analyze()

Analyze a single video file. Runs the full pipeline and writes the VAF file to disk.

```js
await vm.analyze(videoPath)
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `videoPath` | `string` | Path to the video file (mp4, mov, mkv, avi, webm) |

**Returns** `Promise<AnalyzeResult>`

```ts
{
  video: string,   // input path as provided
  vaf:   string    // path to the written .vaf.json file
}
```

**Example**

```js
const vm = new VideoMind();

const result = await vm.analyze("./assets/videos/tutorial.mp4");

console.log(result);
// {
//   video: "./assets/videos/tutorial.mp4",
//   vaf:   "./assets/vaf/tutorial.vaf.json"
// }
```

**Custom output folder**

```js
const vm = new VideoMind()
    .setVafFolder("./output");

const result = await vm.analyze("/footage/interview.mp4");
// VAF written to: ./output/interview.vaf.json
```

**Pipeline stages run internally**

```
1. AudioExtractor        → audio.wav
2. TranscriptExtractor   → audio segments + speech events   ┐ parallel
3. SceneDetector         → visual scene boundaries          ┘
4. TimelineMerger        → unified timeline
5. FrameExtractor        → 3 frames per segment
6. CollageGenerator      → collage.jpg
7. LlmAnalyzer           → final VAF JSON
```

---

### analyzeAssets()

Batch analyze all video files in the configured video folder.

```js
await vm.analyzeAssets(options?)
```

**Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `options` | `object` | `{}` | Optional |
| `options.overwrite` | `boolean` | `false` | Re-analyze videos that already have a VAF file |

**Supported extensions** `.mp4` `.mov` `.mkv` `.avi` `.webm`

**Returns** `Promise<BatchResult>`

```ts
{
  total:     number,
  processed: number,
  skipped:   number,
  failed:    number,
  results:   Array<{
    video:   string,
    vaf?:    string,
    status:  "completed" | "skipped" | "failed",
    error?:  string
  }>
}
```

**Example — default folder**

```js
const vm = new VideoMind();

const summary = await vm.analyzeAssets();

console.log(`Processed: ${summary.processed}/${summary.total}`);
console.log(`Skipped:   ${summary.skipped}`);
console.log(`Failed:    ${summary.failed}`);
```

**Example — custom folder, force re-analyze**

```js
const vm = new VideoMind()
    .setVideoFolder("/media/recordings")
    .setVafFolder("/media/output");

const summary = await vm.analyzeAssets({ overwrite: true });

for (const r of summary.results) {
    if (r.status === "failed") {
        console.error(`Failed: ${r.video} — ${r.error}`);
    }
}
```

**Example — full results inspection**

```js
const summary = await vm.analyzeAssets();

console.log(JSON.stringify(summary, null, 2));
// {
//   "total": 3,
//   "processed": 2,
//   "skipped": 1,
//   "failed": 0,
//   "results": [
//     { "video": "...", "vaf": "...", "status": "completed" },
//     { "video": "...", "vaf": "...", "status": "skipped" },
//     { "video": "...", "vaf": "...", "status": "completed" }
//   ]
// }
```

---

## Pipeline Components

Each pipeline stage is an independent class that can be imported and used standalone.

```js
import {
    AudioExtractor,
    TranscriptExtractor,
    SceneDetector,
    TimelineMerger,
    FrameExtractor,
    CollageGenerator,
    LlmAnalyzer
} from "videomind";
```

---

### AudioExtractor

Extracts the audio track from a video file as a 16kHz mono WAV — the format expected by the transcription API.

```js
import { AudioExtractor } from "videomind";
```

#### Constructor

```js
new AudioExtractor(outputPath)
```

| Parameter | Type | Description |
|---|---|---|
| `outputPath` | `string` | Full path where `audio.wav` will be written |

#### extract()

```js
await extractor.extract(videoPath)
```

| Parameter | Type | Description |
|---|---|---|
| `videoPath` | `string` | Path to input video file |

**Returns** `Promise<AudioResult>`

```ts
{
  video: string,   // input video path
  audio: string    // path to written audio.wav
}
```

**Example**

```js
const extractor = new AudioExtractor("./tmp/audio.wav");

const result = await extractor.extract("./video.mp4");

console.log(result.audio);
// "./tmp/audio.wav"
```

**Audio spec**
- Format: WAV
- Sample rate: 16000 Hz
- Channels: 1 (mono)
- Codec: PCM

---

### TranscriptExtractor

Transcribes audio using the OpenAI audio API, then analyzes the raw transcript with a language model to produce structured segments with speaker labels and speech event annotations.

```js
import { TranscriptExtractor } from "videomind";
```

**Requires** `OPENAI_API_KEY`, `AUDIO_MODEL`, `TEXT_MODEL` in environment.

#### Constructor

```js
new TranscriptExtractor()
```

No parameters. Reads `AUDIO_MODEL` and `TEXT_MODEL` from environment.

#### extract()

```js
await extractor.extract(audioPath)
```

| Parameter | Type | Description |
|---|---|---|
| `audioPath` | `string` | Path to a `.wav` audio file |

**Returns** `Promise<TranscriptResult>`

```ts
{
  audio:      string,
  language:   string | null,
  duration:   number | null,
  speakers:   string[],
  has_speech: boolean,
  segments:   TranscriptSegment[]
}
```

**TranscriptSegment**

```ts
{
  start:             number,
  end:               number,
  speaker:           string | null,
  dialogue:          string | null,   // clean version — no fillers/stammers
  raw_dialogue:      string | null,   // exactly as spoken
  speech_events:     SpeechEvent[],
  has_speech_issues: boolean
}
```

**SpeechEvent**

```ts
{
  type:  "stammer" | "false_start" | "retake" | "filler" |
         "em_dash" | "long_pause"  | "breath",
  start: number,    // seconds
  end:   number,    // seconds
  text:  string | null
}
```

**Example**

```js
const extractor = new TranscriptExtractor();

const result = await extractor.extract("./tmp/audio.wav");

console.log(result.has_speech);    // true
console.log(result.speakers);      // ["Speaker A", "Speaker B"]
console.log(result.segments[0]);
// {
//   start: 0.0,
//   end: 8.3,
//   speaker: "Speaker A",
//   dialogue: "Let me show you how the settings panel works.",
//   raw_dialogue: "Let me— let me show you um how the settings panel works.",
//   speech_events: [
//     { type: "false_start", start: 0.8, end: 1.0, text: "Let me—" },
//     { type: "stammer",     start: 1.1, end: 1.4, text: "let me" },
//     { type: "filler",      start: 3.2, end: 3.5, text: "um" }
//   ],
//   has_speech_issues: true
// }
```

**No-speech fallback**

If no speech is detected in the audio, `extract()` returns:

```js
{
  audio:      "./tmp/audio.wav",
  language:   null,
  duration:   20.0,
  speakers:   [],
  has_speech: false,
  segments:   []
}
```

In this case `TimelineMerger` automatically falls back to using visual scene boundaries as the timeline.

**Internal flow**

```
Call 1 — AUDIO_MODEL (gpt-4o-mini-transcribe)
  audio.wav → verbose_json transcript
  returns: { text, language, duration, segments[], words[] }

Call 2 — TEXT_MODEL (gpt-4.1)
  raw transcript → structured analysis
  returns: { speakers, has_speech, segments[] with speech_events }
```

---

### SceneDetector

Detects visual scene changes using FFmpeg's scene filter. Also exposes a `getMetadata()` method for full video metadata via FFprobe.

```js
import { SceneDetector } from "videomind";
```

#### Constructor

```js
new SceneDetector(threshold?)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `threshold` | `number` | `0.4` | Scene change sensitivity. Range: `0.0`–`1.0`. Lower = more sensitive |

**Threshold guide**

| Value | Behavior |
|---|---|
| `0.2` | Very sensitive — detects subtle lighting changes |
| `0.4` | Default — balanced for most content |
| `0.6` | Less sensitive — only hard cuts |
| `0.8` | Very insensitive — only major scene changes |

#### detect()

```js
await detector.detect(videoPath)
```

| Parameter | Type | Description |
|---|---|---|
| `videoPath` | `string` | Path to input video |

**Returns** `Promise<SceneResult>`

```ts
{
  video:      string,
  sceneCount: number,
  scenes:     Scene[]
}
```

**Scene**

```ts
{
  id:    number,   // 1-based index
  start: number,   // seconds
  end:   number    // seconds
}
```

**Example**

```js
const detector = new SceneDetector(0.4);

const result = await detector.detect("./video.mp4");

console.log(result.sceneCount);  // 5
console.log(result.scenes);
// [
//   { id: 1, start: 0,    end: 9.83  },
//   { id: 2, start: 9.83, end: 22.1  },
//   { id: 3, start: 22.1, end: 35.0  }
// ]
```

**Custom threshold**

```js
// High sensitivity for fast-cut content
const detector = new SceneDetector(0.2);

// Low sensitivity for slow documentaries
const detector = new SceneDetector(0.7);
```

**Fallback behavior**

If no scene changes are detected, a single scene spanning the full video duration is returned:

```js
{ id: 1, start: 0, end: <duration> }
```

#### getMetadata()

Extract full video metadata via FFprobe.

```js
await detector.getMetadata(videoPath)
```

| Parameter | Type | Description |
|---|---|---|
| `videoPath` | `string` | Path to input video |

**Returns** `Promise<VideoMetadata>`

```ts
{
  duration:   number,          // total seconds
  resolution: string | null,   // e.g. "1920x1080"
  fps:        number,          // e.g. 30, 60
  has_audio:  boolean
}
```

**Example**

```js
const detector = new SceneDetector();

const meta = await detector.getMetadata("./video.mp4");

console.log(meta);
// {
//   duration:   142.5,
//   resolution: "1920x1080",
//   fps:        30,
//   has_audio:  true
// }
```

**FPS note**

`getMetadata()` works with any frame rate. All timestamps in VideoMind are in seconds, not frame numbers — so 24fps, 30fps, and 60fps videos are all handled identically.

---

### TimelineMerger

Merges transcript audio segments and visual scene data into a unified, indexed timeline. The audio transcript defines segment boundaries when speech is present. When no speech is detected, visual scene cuts define the boundaries.

```js
import { TimelineMerger } from "videomind";
```

#### Constructor

```js
new TimelineMerger()
```

No parameters.

#### merge()

Merge audio transcript segments with visual scenes. Audio segments take precedence as segment boundaries.

```js
merger.merge(audioSegments, visualSegments)
```

| Parameter | Type | Description |
|---|---|---|
| `audioSegments` | `TranscriptSegment[]` | Output of `TranscriptExtractor.extract().segments` |
| `visualSegments` | `Scene[]` | Output of `SceneDetector.detect().scenes` |

**Returns** `TimelineSegment[]`

```ts
{
  index:             number,
  start:             number,
  end:               number,
  duration:          number,
  speaker:           string | null,
  dialogue:          string | null,
  raw_dialogue:      string | null,
  speech_events:     SpeechEvent[],
  has_speech_issues: boolean
}[]
```

**Example**

```js
const merger = new TimelineMerger();

const timeline = merger.merge(
    transcript.segments,
    scenes.scenes
);

console.log(timeline[0]);
// {
//   index: 1, start: 0, end: 8.3, duration: 8.3,
//   speaker: "Speaker A",
//   dialogue: "Let me show you the settings.",
//   raw_dialogue: "Let me— let me show you um the settings.",
//   speech_events: [...],
//   has_speech_issues: true
// }
```

#### fromVisual()

Create a timeline from visual scenes only — used automatically when no speech is detected.

```js
merger.fromVisual(visualSegments)
```

| Parameter | Type | Description |
|---|---|---|
| `visualSegments` | `Scene[]` | Output of `SceneDetector.detect().scenes` |

**Returns** `TimelineSegment[]` — all speech fields set to `null` / `[]`

**Example**

```js
// Manual fallback for music videos, silent content
const merger = new TimelineMerger();

const timeline = merger.fromVisual(scenes.scenes);

console.log(timeline[0]);
// {
//   index: 1, start: 0, end: 9.83, duration: 9.83,
//   speaker: null, dialogue: null, raw_dialogue: null,
//   speech_events: [], has_speech_issues: false
// }
```

---

### FrameExtractor

Extracts three representative frames per timeline segment — start, middle, and end — as JPEG files.

```js
import { FrameExtractor } from "videomind";
```

#### Constructor

```js
new FrameExtractor(outputDir)
```

| Parameter | Type | Description |
|---|---|---|
| `outputDir` | `string` | Directory where frame JPEGs will be saved |

#### extract()

```js
await extractor.extract(videoPath, timeline)
```

| Parameter | Type | Description |
|---|---|---|
| `videoPath` | `string` | Path to input video |
| `timeline` | `TimelineSegment[]` | Output of `TimelineMerger.merge()` |

**Returns** `Promise<FrameResult>`

```ts
{
  video:      string,
  frameCount: number,
  frames:     Frame[]
}
```

**Frame**

```ts
{
  segmentIndex:    number,
  segmentStart:    number,
  segmentEnd:      number,
  segmentSpeaker:  string | null,
  segmentDialogue: string | null,
  frameType:       "start" | "middle" | "end",
  timestamp:       number,
  timestampFormatted: string,   // "00:00:02.500"
  file:            string       // path to JPEG file
}
```

**File naming**

```
segment_1_start.jpg
segment_1_middle.jpg
segment_1_end.jpg
segment_2_start.jpg
...
```

**Timestamp clamping**

The `end` frame is extracted at `segment.end - 0.1s` to avoid FFmpeg EOF errors when the last segment ends exactly at video duration.

**Example**

```js
const extractor = new FrameExtractor("./tmp/frames");

const result = await extractor.extract("./video.mp4", timeline);

console.log(`Extracted ${result.frameCount} frames`);
// Extracted 12 frames

console.log(result.frames[0]);
// {
//   segmentIndex: 1,
//   segmentStart: 0,
//   segmentEnd: 8.3,
//   segmentSpeaker: "Speaker A",
//   segmentDialogue: "Let me show you...",
//   frameType: "start",
//   timestamp: 0,
//   timestampFormatted: "00:00:00.000",
//   file: "./tmp/frames/segment_1_start.jpg"
// }
```

---

### CollageGenerator

Stitches all extracted frames into a single JPEG timeline collage. Each row in the collage corresponds to one timeline segment and includes a header showing segment index, time range, speaker, and dialogue snippet. The collage is the visual input the LLM receives.

```js
import { CollageGenerator } from "videomind";
```

#### Constructor

```js
new CollageGenerator(options)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `options.output` | `string` | **required** | Path where `collage.jpg` will be written |
| `options.frameWidth` | `number` | `250` | Width of each frame thumbnail in pixels |
| `options.frameHeight` | `number` | `400` | Height of each frame thumbnail in pixels |
| `options.sceneGap` | `number` | `40` | Vertical gap between segment rows in pixels |

#### generate()

```js
await generator.generate(frames)
```

| Parameter | Type | Description |
|---|---|---|
| `frames` | `Frame[]` | Output of `FrameExtractor.extract().frames` |

**Returns** `Promise<CollageResult>`

```ts
{
  collage:      string,   // path to written collage.jpg
  segmentCount: number
}
```

**Collage layout**

```
┌─────────────────────────────────────────────────────────────┐
│  Segment 1  │  0.00s → 8.30s  │  Speaker A                  │
│  "Let me show you how the settings panel..."                 │
├──────────────────┬──────────────────┬───────────────────────┤
│      START       │      MIDDLE      │         END           │
│   [frame image]  │   [frame image]  │    [frame image]      │
└──────────────────┴──────────────────┴───────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Segment 2  │  8.30s → 22.10s  │  Speaker A                 │
│  "Now let me open the dashboard..."                          │
├──────────────────┬──────────────────┬───────────────────────┤
│      START       │      MIDDLE      │         END           │
│   [frame image]  │   [frame image]  │    [frame image]      │
└──────────────────┴──────────────────┴───────────────────────┘
```

**Example**

```js
const generator = new CollageGenerator({
    output: "./tmp/collage.jpg"
});

const result = await generator.generate(frames.frames);

console.log(result.collage);       // "./tmp/collage.jpg"
console.log(result.segmentCount);  // 4
```

**Custom frame size**

```js
const generator = new CollageGenerator({
    output:      "./collage.jpg",
    frameWidth:  320,
    frameHeight: 180,
    sceneGap:    20
});
```

---

### LlmAnalyzer

Sends the timeline collage and transcript context to the vision LLM. For each segment it adds visual fields: `description`, `shot_type`, `camera_angle`, `camera_movement`, and `audio_type`. Also determines `content_type` and `summary` for the full video. Returns the complete VAF object.

```js
import { LlmAnalyzer } from "videomind";
```

**Requires** `OPENAI_API_KEY`, `VISION_MODEL` in environment.

#### Constructor

```js
new LlmAnalyzer()
```

No parameters. Reads `VISION_MODEL` (falls back to `TEXT_MODEL`) from environment.

#### analyze()

```js
await analyzer.analyze(input)
```

**Input object**

| Field | Type | Description |
|---|---|---|
| `collagePath` | `string` | Path to the collage JPEG |
| `timeline` | `TimelineSegment[]` | Merged timeline from `TimelineMerger` |
| `transcript` | `TranscriptResult` | Full result from `TranscriptExtractor` |
| `metadata` | `VideoMetadata` | Result from `SceneDetector.getMetadata()` |
| `videoPath` | `string` | Original video file path (for filename in VAF) |

**Returns** `Promise<VafObject>` — complete VAF JSON object (see [VAF Schema](#vaf-schema))

**Example**

```js
const analyzer = new LlmAnalyzer();

const vaf = await analyzer.analyze({
    collagePath: "./tmp/collage.jpg",
    timeline,
    transcript,
    metadata,
    videoPath:   "./assets/videos/tutorial.mp4"
});

console.log(vaf.content_type);         // "tutorial"
console.log(vaf.timeline[0].shot_type); // "medium_shot"
console.log(vaf.summary);
// "A tutorial video walking through the settings panel..."
```

---

## Utilities

### TempManager

Manages temporary job directories created during analysis. Each job gets a unique directory under `./tmp/`.

```js
import { TempManager } from "videomind";
```

#### Constructor

```js
new TempManager(tempRoot?)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `tempRoot` | `string` | `"./tmp"` | Root directory for all job folders |

#### createJob()

Create a new job directory with all required subdirectories.

```js
const job = temp.createJob()
```

**Returns** `Job`

```ts
{
  id:          string,   // "job_1749123456789"
  path:        string,   // "./tmp/job_1749123456789"
  framesPath:  string,   // "./tmp/job_1749123456789/frames"
  audioPath:   string,   // "./tmp/job_1749123456789/audio.wav"
  collagePath: string    // "./tmp/job_1749123456789/collage.jpg"
}
```

**Example**

```js
const temp = new TempManager();
const job  = temp.createJob();

console.log(job.id);          // "job_1749123456789"
console.log(job.framesPath);  // "./tmp/job_1749123456789/frames"
```

#### cleanJob()

Delete a single job directory and all its contents.

```js
temp.cleanJob(jobPath)
```

| Parameter | Type | Description |
|---|---|---|
| `jobPath` | `string` | `job.path` from `createJob()` |

**Example**

```js
const job = temp.createJob();

// ... do analysis ...

temp.cleanJob(job.path);
// ./tmp/job_1749123456789/ is removed
```

#### cleanAll()

Delete the entire `tmp/` root directory.

```js
temp.cleanAll()
```

**Example**

```js
const temp = new TempManager();
temp.cleanAll();
// ./tmp/ and all job directories are removed
```

---

## VAF Schema

The Video Analysis Format (VAF) is the complete structured output of VideoMind analysis. It is saved as a `.vaf.json` file and designed to be consumed by LLMs and editing automation tools.

### Top-Level Fields

```ts
{
  video:        string,         // filename only, e.g. "tutorial.mp4"
  duration:     number,         // total seconds
  resolution:   string | null,  // "1920x1080"
  fps:          number,         // 24 | 30 | 60 | ...
  has_audio:    boolean,
  has_speech:   boolean,
  language:     string | null,  // "en", "fr", null if no speech
  content_type: string,         // see Content Type values below
  speakers:     string[],       // ["Speaker A", "Speaker B"] or []
  scene_count:  number,
  timeline:     TimelineSegment[],
  summary:      string
}
```

**Content Type values**

| Value | Description |
|---|---|
| `tutorial` | Instructional / how-to video |
| `interview` | Interview or conversation |
| `documentary` | Documentary or informational |
| `cinematic` | Narrative film or short film |
| `music_video` | Music video |
| `screen_recording` | Screen capture / software demo |
| `vlog` | Vlog or personal video |
| `presentation` | Slide presentation or lecture |
| `other` | Does not fit above categories |

---

### Timeline Segment

Each entry in the `timeline` array represents one analyzed segment of the video.

```ts
{
  // Timing
  index:             number,          // 1-based position in timeline
  start:             number,          // start time in seconds
  end:               number,          // end time in seconds
  duration:          number,          // end - start in seconds

  // Visual (filled by LlmAnalyzer from collage)
  description:       string,          // what is happening visually
  shot_type:         ShotType,
  camera_angle:      CameraAngle,
  camera_movement:   CameraMovement,

  // Audio
  audio_type:        AudioType,

  // Speech (null when no speech in segment)
  speaker:           string | null,   // "Speaker A" | "Speaker B" | null
  dialogue:          string | null,   // clean version — intended message
  raw_dialogue:      string | null,   // exactly as spoken, imperfections included
  speech_events:     SpeechEvent[],   // [] when no speech issues
  has_speech_issues: boolean
}
```

**ShotType values**

| Value | Description |
|---|---|
| `extreme_close_up` | Tight detail — eye, hand, object |
| `close_up` | Face or object fills the frame |
| `medium_close_up` | Chest and up |
| `medium_shot` | Waist and up |
| `medium_wide` | Knees and up |
| `wide_shot` | Full body visible |
| `extreme_wide` | Subject small, environment dominant |
| `over_the_shoulder` | OTS — common in conversations |
| `point_of_view` | From subject's perspective |
| `two_shot` | Two subjects in frame |
| `screen_recording` | Screen capture content |
| `title_card` | Text / title overlay |

**CameraAngle values**

| Value | Description |
|---|---|
| `eye_level` | Camera at subject's eye height |
| `high_angle` | Camera looking down at subject |
| `low_angle` | Camera looking up at subject |
| `bird_eye` | Directly overhead |
| `dutch_angle` | Tilted / canted |
| `over_the_shoulder` | Behind and over subject |

**CameraMovement values**

| Value | Description |
|---|---|
| `static` | Camera does not move |
| `pan` | Horizontal rotation |
| `tilt` | Vertical rotation |
| `zoom_in` | Lens zooming in |
| `zoom_out` | Lens zooming out |
| `dolly` | Camera moving toward/away from subject |
| `tracking` | Camera following subject |
| `handheld` | Unsteady, handheld movement |
| `cut` | Hard cut between shots |

**AudioType values**

| Value | Description |
|---|---|
| `speech` | Person speaking to camera or others |
| `narration` | Voice-over narration |
| `music` | Music track, no speech |
| `ambient` | Background / environmental sound |
| `silence` | No audio |

---

### SpeechEvent

A timestamped speech imperfection within a segment.

```ts
{
  type:  SpeechEventType,
  start: number,          // seconds — start of the imperfection
  end:   number,          // seconds — end of the imperfection
  text:  string | null    // the actual spoken text (null for long_pause, breath)
}
```

**SpeechEventType values**

| Value | Description | Example |
|---|---|---|
| `stammer` | Syllable or word repetition | `"I-I"`, `"th-the"` |
| `false_start` | Began phrase, stopped mid-way | `"Let me—"` |
| `retake` | Clean repeat after a mistake | `"the settings"` after `"the—"` |
| `filler` | Filler word or sound | `"um"`, `"uh"`, `"like"`, `"you know"` |
| `em_dash` | Hard abrupt mid-sentence stop | `"section—"` |
| `long_pause` | Silence gap > 0.8s mid-segment | `null` |
| `breath` | Audible breath before speaking | `null` |

---

### Full VAF Example

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
      "description": "Presenter sits at desk facing camera, opens browser on screen behind them",
      "shot_type": "medium_shot",
      "camera_angle": "eye_level",
      "camera_movement": "static",
      "audio_type": "speech",
      "speaker": "Speaker A",
      "dialogue": "Let me show you how the settings panel works.",
      "raw_dialogue": "Let me— let me show you um how the settings panel works.",
      "speech_events": [
        { "type": "false_start", "start": 0.8, "end": 1.0, "text": "Let me—" },
        { "type": "stammer",     "start": 1.1, "end": 1.4, "text": "let me" },
        { "type": "filler",      "start": 3.2, "end": 3.5, "text": "um" }
      ],
      "has_speech_issues": true
    },
    {
      "index": 2,
      "start": 8.3,
      "end": 22.1,
      "duration": 13.8,
      "description": "Close-up of screen showing dashboard with settings icon highlighted",
      "shot_type": "screen_recording",
      "camera_angle": "eye_level",
      "camera_movement": "static",
      "audio_type": "speech",
      "speaker": "Speaker A",
      "dialogue": "Click the gear icon in the top right to open settings.",
      "raw_dialogue": "Click the gear icon in the top right to open settings.",
      "speech_events": [],
      "has_speech_issues": false
    }
  ],
  "summary": "A tutorial video demonstrating how to navigate and configure the settings panel of a web dashboard application."
}
```

---

## Type Reference

Quick reference of all TypeScript-style types used across the API.

```ts
// VideoMind
type AnalyzeResult  = { video: string, vaf: string }
type BatchResult    = { total: number, processed: number, skipped: number, failed: number, results: BatchItem[] }
type BatchItem      = { video: string, vaf?: string, status: "completed"|"skipped"|"failed", error?: string }

// SceneDetector
type SceneResult    = { video: string, sceneCount: number, scenes: Scene[] }
type Scene          = { id: number, start: number, end: number }
type VideoMetadata  = { duration: number, resolution: string|null, fps: number, has_audio: boolean }

// AudioExtractor
type AudioResult    = { video: string, audio: string }

// TranscriptExtractor
type TranscriptResult   = { audio: string, language: string|null, duration: number|null, speakers: string[], has_speech: boolean, segments: TranscriptSegment[] }
type TranscriptSegment  = { start: number, end: number, speaker: string|null, dialogue: string|null, raw_dialogue: string|null, speech_events: SpeechEvent[], has_speech_issues: boolean }
type SpeechEvent        = { type: SpeechEventType, start: number, end: number, text: string|null }
type SpeechEventType    = "stammer"|"false_start"|"retake"|"filler"|"em_dash"|"long_pause"|"breath"

// TimelineMerger
type TimelineSegment    = TranscriptSegment & { index: number, duration: number }

// FrameExtractor
type FrameResult    = { video: string, frameCount: number, frames: Frame[] }
type Frame          = { segmentIndex: number, segmentStart: number, segmentEnd: number, segmentSpeaker: string|null, segmentDialogue: string|null, frameType: "start"|"middle"|"end", timestamp: number, timestampFormatted: string, file: string }

// CollageGenerator
type CollageResult  = { collage: string, segmentCount: number }

// TempManager
type Job            = { id: string, path: string, framesPath: string, audioPath: string, collagePath: string }

// VAF
type ShotType       = "extreme_close_up"|"close_up"|"medium_close_up"|"medium_shot"|"medium_wide"|"wide_shot"|"extreme_wide"|"over_the_shoulder"|"point_of_view"|"two_shot"|"screen_recording"|"title_card"
type CameraAngle    = "eye_level"|"high_angle"|"low_angle"|"bird_eye"|"dutch_angle"|"over_the_shoulder"
type CameraMovement = "static"|"pan"|"tilt"|"zoom_in"|"zoom_out"|"dolly"|"tracking"|"handheld"|"cut"
type AudioType      = "speech"|"narration"|"music"|"ambient"|"silence"
type ContentType    = "tutorial"|"interview"|"documentary"|"cinematic"|"music_video"|"screen_recording"|"vlog"|"presentation"|"other"
```

---

## Environment Variables

All environment variables are loaded via `dotenv` from a `.env` file in the project root.

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | LLM provider — currently only `openai` is supported |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `OPENAI_BASE_URL` | Yes | OpenAI API base URL — `https://api.openai.com/v1` |
| `TEXT_MODEL` | Yes | Model for transcript analysis — e.g. `gpt-4.1` |
| `VISION_MODEL` | Yes | Vision-capable model for VAF generation — e.g. `gpt-4.1` |
| `AUDIO_MODEL` | Yes | Audio transcription model — e.g. `gpt-4o-mini-transcribe` |

**`.env` example**

```env
LLM_PROVIDER=openai

OPENAI_API_KEY=sk-proj-...
OPENAI_BASE_URL=https://api.openai.com/v1

TEXT_MODEL=gpt-4.1
VISION_MODEL=gpt-4.1
AUDIO_MODEL=gpt-4o-mini-transcribe
```

---

## Error Handling

All async methods reject with standard `Error` objects. Use `try/catch` or `.catch()`.

**Single video**

```js
try {
    const result = await vm.analyze("./video.mp4");
    console.log("VAF:", result.vaf);
} catch (err) {
    console.error("Analysis failed:", err.message);
}
```

**Batch — individual failures are non-fatal**

`analyzeAssets()` catches per-video errors internally. Failed videos appear in `results` with `status: "failed"` and an `error` message. The batch continues to the next video.

```js
const summary = await vm.analyzeAssets();

const failures = summary.results.filter(r => r.status === "failed");

for (const f of failures) {
    console.error(`${f.video}: ${f.error}`);
}
```

**Common errors**

| Error | Cause | Fix |
|---|---|---|
| `FFmpeg exited with code 1` | Input file is corrupt or unsupported format | Verify the video file plays correctly |
| `FFmpeg exited with code 234` | Seek timestamp is past end of video | Update to latest VideoMind — this is handled automatically |
| `Cannot find package 'openai'` | Dependencies not installed | Run `npm install` |
| `No valid segment images generated` | All frame files were empty or missing | Check FFmpeg is installed and the video has a valid video stream |
| `OPENAI_API_KEY is not set` | `.env` file missing or not loaded | Create `.env` from `.env.example` |

---

## License

VideoMind is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See [LICENSE](./LICENSE) for the full license text.
