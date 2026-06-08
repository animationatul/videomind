import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

/*
Primary path — SRT parsed in code, LLM only enriches (no timestamps).
*/
const ENRICHMENT_PROMPT = `You are a professional video transcript analyzer.

You receive an array of speech segments that already have accurate start/end timestamps and text.
Your job is to enrich each segment. Do NOT change start/end timestamps. Do NOT merge or split segments.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT ADD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start         — copy exactly from input (do not change)
2. end           — copy exactly from input (do not change)
3. speaker       — "Speaker A", "Speaker B", etc. Single voice = "Speaker A"
4. dialogue      — clean text: remove fillers, stammers, false starts. Keep all meaning.
5. raw_dialogue  — verbatim copy of the input text field
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
Fallback — used when the model returns verbose_json without word timestamps.
LLM receives model segments and enriches them; timestamps are pinned afterward.
*/
const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a verbose transcript with segments that have precise start/end timestamps.
Enrich each segment. Do NOT merge, split, or re-segment. Do NOT change timestamps.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT RETURN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start / end   — copy exactly from input
2. speaker       — "Speaker A", "Speaker B", etc.
3. dialogue      — clean text: remove fillers, stammers, false starts
4. raw_dialogue  — verbatim as transcribed
5. speech_events — { "type", "start", "end", "text" } for each event:
     stammer / false_start / retake / filler / em_dash / long_pause / breath
6. has_speech_issues — true if speech_events is non-empty

Return ONLY valid JSON — same structure as ENRICHMENT_PROMPT above.
If no speech: { "speakers": [], "has_speech": false, "segments": [] }`;

/*
Last-resort fallback — no timestamps available, LLM estimates from character proportion.
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

1. start / end       — estimated seconds
2. speaker           — "Speaker A", "Speaker B", etc.
3. dialogue          — clean text
4. raw_dialogue      — verbatim
5. speech_events     — { "type", "start", "end", "text" }
6. has_speech_issues — true if speech_events non-empty

Return ONLY valid JSON. No markdown, no code blocks.

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

If no speech: { "speakers": [], "has_speech": false, "segments": [] }`;


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

    async extract(audioPath, duration = null, startTimeOffset = 0) {

        console.log("Transcribing audio...");

        // ── Step 1: SRT call — timestamps come from the model, parsed in code ──
        let srtSegments = null;
        let language    = null;

        try {

            const srtContent =
                await this.client.audio.transcriptions.create({
                    file:
                        fs.createReadStream(audioPath),
                    model:
                        this.audioModel,
                    response_format:
                        "srt"
                });

            srtSegments = this.parseSrt(srtContent);

        }
        catch {
            // SRT not supported by this model — fall through to verbose_json
        }

        // ── Step 2: verbose_json fallback (for language + timestamp fallback) ──
        let rawTranscript = null;

        if (!srtSegments?.length) {

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

            language = rawTranscript?.language ?? null;

        }

        // ── Step 3: empty audio guard ──────────────────────────────────────────
        const resolvedDuration =
            rawTranscript?.duration ?? duration;

        const hasContent =
            srtSegments?.length > 0 ||
            (rawTranscript?.text?.trim() !== "" &&
             rawTranscript?.text != null);

        if (!hasContent) {

            return {
                audio:     audioPath,
                language:  null,
                duration:  resolvedDuration,
                speakers:  [],
                has_speech: false,
                segments:  []
            };

        }

        console.log("Analyzing segments and speech events...");

        // ── Step 4: LLM enrichment ─────────────────────────────────────────────
        const structured =
            await this.analyzeTranscript(
                srtSegments,
                rawTranscript,
                resolvedDuration
            );

        // ── Step 5: container start_time offset ───────────────────────────────
        if (startTimeOffset > 0 && structured.segments?.length > 0) {

            structured.segments =
                structured.segments.map(seg => ({
                    ...seg,
                    start: Number((seg.start + startTimeOffset).toFixed(3)),
                    end:   Number((seg.end   + startTimeOffset).toFixed(3)),
                    speech_events: seg.speech_events?.map(ev => ({
                        ...ev,
                        start: Number((ev.start + startTimeOffset).toFixed(3)),
                        end:   Number((ev.end   + startTimeOffset).toFixed(3))
                    })) ?? []
                }));

        }

        return {
            audio:      audioPath,
            language,
            duration:   resolvedDuration,
            speakers:   structured.speakers,
            has_speech: structured.has_speech,
            segments:   structured.segments
        };

    }

    // ── SRT parsing ────────────────────────────────────────────────────────────

    parseSrt(srtText) {

        if (!srtText) return [];

        const blocks =
            String(srtText).trim().split(/\n\n+/);

        const segments = [];

        for (const block of blocks) {

            const lines =
                block.trim().split("\n");

            if (lines.length < 2) continue;

            const timeLineIdx =
                lines.findIndex(l => l.includes("-->"));

            if (timeLineIdx === -1) continue;

            const [startStr, endStr] =
                lines[timeLineIdx]
                    .split("-->")
                    .map(s => s.trim());

            const text =
                lines.slice(timeLineIdx + 1)
                    .join(" ")
                    .trim();

            if (!text) continue;

            const start = this.srtTimeToSeconds(startStr);
            const end   = this.srtTimeToSeconds(endStr);

            if (isNaN(start) || isNaN(end)) continue;

            segments.push({ start, end, text });

        }

        return segments;

    }

    srtTimeToSeconds(str) {

        // "00:00:01,480" or "00:00:01.480"
        const normalized = str.trim().replace(",", ".");
        const dotIdx     = normalized.lastIndexOf(".");
        const hms        = dotIdx >= 0 ? normalized.slice(0, dotIdx) : normalized;
        const msStr      = dotIdx >= 0 ? normalized.slice(dotIdx + 1) : "000";

        const parts = hms.split(":").map(Number);
        let seconds = 0;
        for (const p of parts) seconds = seconds * 60 + p;

        return Number(
            (seconds + Number(msStr.padEnd(3, "0").slice(0, 3)) / 1000).toFixed(3)
        );

    }

    // ── Analysis routing ───────────────────────────────────────────────────────

    async analyzeTranscript(srtSegments, rawTranscript, duration) {

        // Path 1: SRT segments — timestamps come from deterministic parser
        if (srtSegments?.length > 0) {
            return this.enrichSegments(srtSegments, duration);
        }

        // Path 2: word-level timestamps from verbose_json
        const wordSegments =
            this.segmentByWords(rawTranscript?.words, duration);

        if (wordSegments) {
            return this.enrichSegments(wordSegments, duration);
        }

        // Path 3: model-level segments from verbose_json
        const modelSegments = rawTranscript?.segments ?? [];

        if (modelSegments.length > 0) {

            const userContent =
                `Total audio duration: ${duration?.toFixed(3)} seconds\n\n` +
                JSON.stringify(rawTranscript, null, 2);

            const result =
                await this.callLlm(ANALYSIS_SYSTEM_PROMPT, userContent);

            // Pin timestamps so LLM cannot drift them
            if (result.segments?.length === modelSegments.length) {
                result.segments = result.segments.map((seg, i) => ({
                    ...seg,
                    start: modelSegments[i].start,
                    end:   modelSegments[i].end
                }));
            }

            return result;

        }

        // Path 4: text only — LLM estimates from character proportion
        const systemPrompt =
            FULL_ANALYSIS_PROMPT.replace("[TOTAL_DURATION]", duration.toFixed(3));

        const userContent =
            `Total audio duration: ${duration.toFixed(3)} seconds\n\n` +
            `Transcript:\n${rawTranscript.text}`;

        return this.callLlm(systemPrompt, userContent);

    }

    // Enrich pre-segmented timestamps with LLM, then pin timestamps back.
    async enrichSegments(segments, duration) {

        const userContent = JSON.stringify({
            total_duration: duration,
            segments
        }, null, 2);

        const result =
            await this.callLlm(ENRICHMENT_PROMPT, userContent);

        // Always pin timestamps from source — LLM output is discarded for start/end
        if (result.segments?.length === segments.length) {
            result.segments = result.segments.map((seg, i) => ({
                ...seg,
                start: segments[i].start,
                end:   segments[i].end
            }));
        }

        return result;

    }

    // Splits word-level timestamp data into sentence segments at punctuation.
    segmentByWords(words, duration) {

        if (!words?.length) return null;

        const SENTENCE_END = /[.!?।॥؟！。？]/;
        const segments = [];
        let current = [];

        for (const w of words) {

            current.push(w);

            if (SENTENCE_END.test(w.word)) {

                segments.push({
                    start: current[0].start,
                    end:   current[current.length - 1].end,
                    text:  current.map(x => x.word).join("").trim()
                });

                current = [];

            }

        }

        if (current.length > 0) {

            segments.push({
                start: current[0].start,
                end:   duration ?? current[current.length - 1].end,
                text:  current.map(x => x.word).join("").trim()
            });

        }

        return segments.length > 0 ? segments : null;

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
