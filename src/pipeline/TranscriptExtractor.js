import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a raw transcript from an audio file, along with the total audio duration in seconds.
Your job is to split the speech into multiple segments and return structured data for each one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENTATION RULES (follow in priority order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DIALOGUE BOUNDARY FIRST — always break at a natural speech boundary:
   a complete sentence, a topic shift, a speaker pause, or a change in subject.
   Never cut mid-sentence or mid-thought.

2. TARGET LENGTH — aim for 20–60 seconds per segment.
   This is a soft guideline. If a natural topic block runs 65s or 18s,
   keep it intact rather than forcing a cut to hit the range.

3. COVER THE FULL DURATION — segments must span exactly 0.000 to [TOTAL_DURATION].
   No gaps. No overlaps. First segment starts at 0.000.
   Last segment ends at exactly [TOTAL_DURATION].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIMING WITHOUT WORD TIMESTAMPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the transcript contains word or segment timestamps, use them directly.

If NO timestamps are available (plain text only):
  - Identify the natural dialogue/topic breaks first.
  - Count the total characters in the full transcript.
  - Each segment's duration = (segment_chars / total_chars) * total_duration.
  - Compute start/end cumulatively from these proportional durations.
  - Round all timestamps to 3 decimal places.
  - Ensure the last segment's end equals total_duration exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT, PROVIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start / end — timestamps in seconds (see timing rules above)
2. speaker — "Speaker A", "Speaker B", etc. One voice = always "Speaker A"
3. dialogue — clean version: remove fillers, stammers, false starts
4. raw_dialogue — verbatim as spoken, including all imperfections
5. speech_events — list of events detected within this segment:
   - "stammer": syllable or word repetition ("I-I think", "th-the")
   - "false_start": phrase begun but abandoned mid-way
   - "retake": phrase repeated cleanly right after a mistake
   - "filler": filler words ("um", "uh", "er", "like", "you know", "so", "basically")
   - "em_dash": hard abrupt mid-sentence stop (—)
   - "long_pause": silence gap > 0.8s between words within the segment
   - "breath": audible breath before or during speech
   Each event: { "type", "start", "end", "text" }
   If no timestamps are available, estimate event positions within the segment proportionally.
6. has_speech_issues — true if any speech_events exist, otherwise false

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
