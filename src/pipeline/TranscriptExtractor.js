import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

/*
Used when the transcript has real word/segment timestamps (verbose_json from gpt-4o-transcribe).
The model's segment boundaries are the ground truth — do NOT merge or re-segment.
The LLM only fills in speaker, dialogue, and speech event analysis.
*/
const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a verbose transcript from an audio transcription model.
It includes an array of segments, each with precise start/end timestamps and transcribed text.

Your job is to analyze each segment and return the structured fields below.
Do NOT merge, split, or re-segment. Each input segment becomes exactly one output segment.
Copy start and end timestamps exactly as given — do not modify them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT RETURN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start         — copy exactly from input (do not change)
2. end           — copy exactly from input (do not change)
3. speaker       — "Speaker A", "Speaker B", etc. Single voice = "Speaker A"
4. dialogue      — clean text: remove fillers, stammers, false starts. Keep all meaning.
5. raw_dialogue  — verbatim as transcribed in the input segment
6. speech_events — events within this segment:
     "stammer"     : syllable or word repetition ("I-I think", "th-the")
     "false_start" : phrase begun but abandoned mid-way
     "retake"      : phrase repeated cleanly right after a mistake
     "filler"      : filler words/sounds ("um", "uh", "er", "like", "you know")
     "em_dash"     : hard abrupt mid-sentence stop (—)
     "long_pause"  : silence gap > 0.8s within the segment
     "breath"      : audible breath before or during speech
   Each event: { "type", "start", "end", "text" }
   Estimate event timestamps proportionally within the segment's start–end window.
7. has_speech_issues — true if speech_events is non-empty, otherwise false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON. No markdown, no code blocks, no explanation.

{
  "speakers": ["Speaker A"],
  "has_speech": true,
  "segments": [
    {
      "start": 0.0,
      "end": 4.2,
      "speaker": "Speaker A",
      "dialogue": "Let me show you how the settings panel works.",
      "raw_dialogue": "Let me— let me show you um how the settings panel works.",
      "speech_events": [
        { "type": "false_start", "start": 0.8, "end": 1.0, "text": "Let me—" },
        { "type": "filler", "start": 3.2, "end": 3.5, "text": "um" }
      ],
      "has_speech_issues": true
    }
  ]
}

If no speech is detected: { "speakers": [], "has_speech": false, "segments": [] }`;

/*
Used when there are no timestamps (json format from gpt-4o-mini-transcribe).
The LLM receives the raw transcript text and does both segmentation and analysis.
It splits at every punctuation boundary and estimates timestamps proportionally.
*/
const FULL_ANALYSIS_PROMPT = `You are a professional video transcript analyzer.

You receive the full transcript text and the total audio duration in seconds.
Your job is to split the speech into segments at every punctuation boundary and return structured data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENTATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Split at EVERY punctuation mark: . , ! ? ; : — … । ॥ ؟ ！ 。 ？
Each comma, full stop, em-dash, and pause indicator = one segment boundary.
Do NOT group multiple clauses into one segment.
Every phrase between punctuation marks must be its own segment.

Estimate timestamps using character proportion:
  segment_start = (characters before this segment / total characters) × total_duration
  segment_end   = (characters through this segment / total characters) × total_duration
Round all times to 3 decimal places.
First segment must start at 0.000. Last segment must end at exactly [TOTAL_DURATION].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT RETURN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start         — estimated start time in seconds
2. end           — estimated end time in seconds
3. speaker       — "Speaker A", "Speaker B", etc. Single voice = "Speaker A"
4. dialogue      — clean text: remove fillers, stammers, false starts
5. raw_dialogue  — verbatim as it appears in the input transcript
6. speech_events — events within this segment:
     "stammer"     : syllable or word repetition ("I-I think", "th-the")
     "false_start" : phrase begun but abandoned mid-way
     "retake"      : phrase repeated cleanly right after a mistake
     "filler"      : filler words/sounds ("um", "uh", "er", "like", "you know")
     "em_dash"     : hard abrupt mid-sentence stop (—)
     "long_pause"  : noticeable silence gap within the segment
     "breath"      : audible breath before or during speech
   Each event: { "type", "start", "end", "text" }
   Estimate event timestamps proportionally within the segment's start–end window.
7. has_speech_issues — true if speech_events is non-empty, otherwise false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON. No markdown, no code blocks, no explanation.

{
  "speakers": ["Speaker A"],
  "has_speech": true,
  "segments": [
    {
      "start": 0.000,
      "end": 3.200,
      "speaker": "Speaker A",
      "dialogue": "Let me show you how this works.",
      "raw_dialogue": "Let me, um, show you how this works.",
      "speech_events": [
        { "type": "filler", "start": 1.1, "end": 1.4, "text": "um" }
      ],
      "has_speech_issues": true
    }
  ]
}

If no speech is detected: { "speakers": [], "has_speech": false, "segments": [] }`;


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

        const hasTimestamps =
            (rawTranscript.segments?.length > 0) ||
            (rawTranscript.words?.length > 0);

        if (hasTimestamps) {

            // Real timestamps available — let the LLM do both segmentation
            // and analysis using precise timing
            const systemPrompt = duration
                ? ANALYSIS_SYSTEM_PROMPT.replaceAll(
                    "[TOTAL_DURATION]",
                    duration.toFixed(3)
                )
                : ANALYSIS_SYSTEM_PROMPT;

            const userContent = duration
                ? `Total audio duration: ${duration.toFixed(3)} seconds\n\n${JSON.stringify(rawTranscript, null, 2)}`
                : JSON.stringify(rawTranscript, null, 2);

            return this.callLlm(systemPrompt, userContent);

        }

        // No timestamps — send raw text directly; LLM handles both
        // segmentation (at every punctuation boundary) and analysis
        const systemPrompt =
            FULL_ANALYSIS_PROMPT.replace(
                "[TOTAL_DURATION]",
                duration.toFixed(3)
            );

        const userContent =
            `Total audio duration: ${duration.toFixed(3)} seconds\n\n` +
            `Transcript:\n${rawTranscript.text}`;

        return this.callLlm(systemPrompt, userContent);

    }

    async callLlm(systemPrompt, userContent) {

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
