import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a raw transcript from an audio file and the total audio duration in seconds.
Your job is to split the speech into multiple timed segments and return structured data for each one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — FIND ALL SENTENCE BOUNDARIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scan the full transcript text and mark every position where a sentence ends.
Valid sentence-ending punctuation (works for all languages):

  Strong boundaries (always valid split point):
    .   !   ?   ।   ॥   ؟   ！   。   ？

  Hard-stop boundaries (valid split point only if followed by a new thought):
    —   …   ...

Never split at:
    ,   ;   :   mid-word   mid-number

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — GROUP SENTENCES INTO SEGMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Walk through the sentences one by one and accumulate them into a growing segment.
Use character count as a proxy for spoken duration:

  sentence_duration = (sentence_chars / total_chars) × total_duration

Keep adding sentences to the current segment until the accumulated duration
reaches the TARGET RANGE of 20–60 seconds.

When the accumulated duration reaches or exceeds 20 seconds AND the current
sentence ends at a strong boundary (. ! ? । ॥), close the segment there.

Hard rules:
  - NEVER close a segment mid-sentence or at a comma.
  - If a single sentence alone exceeds 60 seconds, it becomes its own segment.
  - The final segment absorbs all remaining text — do not leave anything out.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — COMPUTE TIMESTAMPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the transcript already contains word or segment timestamps, use them directly
and skip this step.

If NO timestamps are available (plain text only), compute them as follows:

  total_chars          = character count of the entire transcript text
  segment_chars        = character count of this segment's text (spaces included)
  segment_duration     = (segment_chars / total_chars) × total_duration
  segment_start        = sum of all previous segments' durations (first = 0.000)
  segment_end          = segment_start + segment_duration

  Mandatory overrides:
    - First segment: start = 0.000 exactly
    - Last segment:  end   = [TOTAL_DURATION] exactly (override the calculation)

  Round all timestamps to 3 decimal places.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — BUILD EACH SEGMENT OBJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For every segment produced in Steps 2–3, provide:

1. start / end       — timestamps in seconds from Step 3
2. speaker           — "Speaker A", "Speaker B", etc.
                       Single voice = always "Speaker A"
3. dialogue          — clean version: remove fillers, stammers, false starts.
                       Full grammatical sentences only.
4. raw_dialogue      — verbatim as spoken, including all imperfections
5. speech_events     — events detected within this segment's time window:
     "stammer"     : syllable or word repetition ("I-I think", "th-the")
     "false_start" : phrase begun but abandoned mid-way
     "retake"      : phrase repeated cleanly right after a mistake
     "filler"      : filler words/sounds ("um", "uh", "er", "like", "you know")
     "em_dash"     : hard abrupt mid-sentence stop (—)
     "long_pause"  : silence gap > 0.8s between words within the segment
     "breath"      : audible breath before or during speech
   Each event: { "type", "start", "end", "text" }
   When timestamps are unavailable, estimate event positions proportionally
   within the segment's start–end window.
6. has_speech_issues — true if speech_events is non-empty, otherwise false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON — no markdown, no code blocks, no explanation.

{
  "speakers": ["Speaker A"],
  "has_speech": true,
  "segments": [
    {
      "start": 0.0,
      "end": 34.5,
      "speaker": "Speaker A",
      "dialogue": "Let me show you how the settings panel works.",
      "raw_dialogue": "Let me— let me show you um how the— the settings panel works.",
      "speech_events": [
        { "type": "false_start", "start": 0.8, "end": 1.0, "text": "Let me—" },
        { "type": "stammer", "start": 1.1, "end": 1.4, "text": "let me" },
        { "type": "filler", "start": 3.2, "end": 3.5, "text": "um" }
      ],
      "has_speech_issues": true
    }
  ]
}

If no speech is detected, return:
{ "speakers": [], "has_speech": false, "segments": [] }`;

export class TranscriptExtractor {

    constructor() {

        this.client = new OpenAI({
            apiKey:
                process.env.OPENAI_API_KEY,
            baseURL:
                process.env.OPENAI_BASE_URL
        });

        this.audioModel =
            process.env.AUDIO_MODEL;

        this.textModel =
            process.env.TEXT_MODEL;

    }

    async extract(audioPath, duration = null) {

        console.log("Transcribing audio...");

        let rawTranscript;

        try {

            rawTranscript =
                await this.client.audio.transcriptions.create({
                    file:
                        fs.createReadStream(audioPath),
                    model:
                        this.audioModel,
                    response_format:
                        "verbose_json",
                    timestamp_granularities:
                        ["word", "segment"]
                });

        }
        catch {

            try {

                rawTranscript =
                    await this.client.audio.transcriptions.create({
                        file:
                            fs.createReadStream(audioPath),
                        model:
                            this.audioModel,
                        response_format:
                            "verbose_json"
                    });

            }
            catch {

                rawTranscript =
                    await this.client.audio.transcriptions.create({
                        file:
                            fs.createReadStream(audioPath),
                        model:
                            this.audioModel,
                        response_format:
                            "json"
                    });

            }

        }

        const resolvedDuration =
            rawTranscript.duration ?? duration;

        if (
            !rawTranscript.text ||
            rawTranscript.text.trim() === ""
        ) {

            return {
                audio: audioPath,
                language: null,
                duration: resolvedDuration,
                speakers: [],
                has_speech: false,
                segments: []
            };

        }

        console.log(
            "Analyzing segments and speech events..."
        );

        const structured =
            await this.analyzeTranscript(
                rawTranscript,
                resolvedDuration
            );

        return {
            audio: audioPath,
            language:
                rawTranscript.language ?? null,
            duration: resolvedDuration,
            speakers:
                structured.speakers,
            has_speech:
                structured.has_speech,
            segments:
                structured.segments
        };

    }

    async analyzeTranscript(rawTranscript, duration) {

        const systemPrompt = duration
            ? ANALYSIS_SYSTEM_PROMPT.replaceAll(
                "[TOTAL_DURATION]",
                duration.toFixed(3)
            )
            : ANALYSIS_SYSTEM_PROMPT;

        const userContent = duration
            ? `Total audio duration: ${duration.toFixed(3)} seconds\n\n${JSON.stringify(rawTranscript, null, 2)}`
            : JSON.stringify(rawTranscript, null, 2);

        const response =
            await this.client.chat.completions.create({
                model:
                    this.textModel,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userContent
                    }
                ],
                response_format: {
                    type: "json_object"
                }
            });

        return JSON.parse(
            response.choices[0].message.content
        );

    }

}
