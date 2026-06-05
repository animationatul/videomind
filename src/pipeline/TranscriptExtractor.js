import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

/*
Used when the transcript already has word/segment timestamps (verbose_json).
The LLM handles both segmentation and analysis since it has precise timing.
*/
const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a raw transcript from an audio file and the total audio duration in seconds.
Your job is to split the speech into multiple timed segments and return structured data for each one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use the provided word and segment timestamps to group content into segments.
Break at sentence-ending punctuation: . ! ? । ॥ ؟ ！ 。 ？
Target 20–60 seconds per segment. Never cut mid-sentence.
First segment starts at 0.000. Last segment ends at [TOTAL_DURATION] exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start / end       — from the timestamps
2. speaker           — "Speaker A", "Speaker B", etc. Single voice = "Speaker A"
3. dialogue          — clean: remove fillers, stammers, false starts
4. raw_dialogue      — verbatim as spoken
5. speech_events     — events within this segment's time window:
     "stammer"     : syllable or word repetition
     "false_start" : phrase abandoned mid-way
     "retake"      : phrase repeated cleanly after a mistake
     "filler"      : filler words/sounds ("um", "uh", "like", "you know")
     "em_dash"     : hard abrupt mid-sentence stop (—)
     "long_pause"  : silence gap > 0.8s within the segment
     "breath"      : audible breath
   Each event: { "type", "start", "end", "text" }
6. has_speech_issues — true if speech_events is non-empty

Return ONLY valid JSON. No markdown, no code blocks.

{
  "speakers": ["Speaker A"],
  "has_speech": true,
  "segments": [
    {
      "start": 0.0,
      "end": 34.5,
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
Used when there are no timestamps (json format).
Segmentation is done in code — the LLM only fills in the analysis fields.
start/end are already computed and MUST NOT be changed.
*/
const SEGMENT_ANALYSIS_PROMPT = `You are a professional video transcript analyzer.

You receive an array of transcript segments. Each segment already has:
  - text  : the spoken words for that segment
  - start : the segment start time in seconds (DO NOT change this)
  - end   : the segment end time in seconds (DO NOT change this)

Your only job is to analyze each segment and return the structured fields below.
Do NOT re-segment, merge, or split the segments. Do NOT change start or end values.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT, RETURN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start         — copy exactly from input
2. end           — copy exactly from input
3. speaker       — "Speaker A", "Speaker B", etc. Single voice = "Speaker A"
4. dialogue      — clean version of the text: remove fillers, stammers, false starts.
                   Keep all meaningful content. Full sentences only.
5. raw_dialogue  — the text field verbatim, exactly as given
6. speech_events — list of events found within the segment:
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
      "start": 0.0,
      "end": 34.5,
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

// Sentence-ending punctuation across all common languages/scripts
const SENTENCE_END = /[.!?।॥؟！。？]+/u;
const SENTENCE_SPLIT = /(?<=[.!?।॥؟！。？]+)\s*/u;

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

    /*
    Splits plain text into segments at sentence-boundary punctuation.
    Groups sentences until the proportional character-count reaches
    the minSeconds target, then closes the segment.
    Returns: [{ text, start, end }, ...]
    */
    segmentByPunctuation(text, totalDuration, minSeconds = 20) {

        // Split on sentence-ending punctuation, keeping the delimiter
        const sentences = text
            .split(SENTENCE_SPLIT)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const totalChars = text.length;
        const segments = [];
        let current = [];
        let currentChars = 0;
        let runningTime = 0;

        const flush = (isLast) => {

            if (current.length === 0) return;

            const segText = current.join(" ").trim();
            const segDuration =
                (segText.length / totalChars) * totalDuration;

            const start = Number(runningTime.toFixed(3));

            const end = isLast
                ? Number(totalDuration.toFixed(3))
                : Number((runningTime + segDuration).toFixed(3));

            segments.push({ text: segText, start, end });

            runningTime = end;
            current = [];
            currentChars = 0;

        };

        for (let i = 0; i < sentences.length; i++) {

            const s = sentences[i];
            current.push(s);
            currentChars += s.length;

            const accumulated =
                (currentChars / totalChars) * totalDuration;

            const isLast = i === sentences.length - 1;
            const endsAtBoundary = SENTENCE_END.test(s);

            if (isLast) {
                flush(true);
            } else if (accumulated >= minSeconds && endsAtBoundary) {
                flush(false);
            }

        }

        return segments;

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

        // No timestamps — split by punctuation in code, then LLM
        // only analyses content (start/end are already determined)
        const segments =
            this.segmentByPunctuation(
                rawTranscript.text,
                duration
            );

        const userContent =
            `Total audio duration: ${duration.toFixed(3)} seconds\n\n` +
            JSON.stringify(segments, null, 2);

        return this.callLlm(SEGMENT_ANALYSIS_PROMPT, userContent);

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
