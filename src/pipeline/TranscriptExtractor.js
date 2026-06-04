import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a raw transcript from an audio file with segment timestamps.
Analyze it and return structured segment data.

For each segment:
1. Determine the speaker (Speaker A, Speaker B, etc.) based on content and context clues. If only one voice, use Speaker A.
2. Write clean dialogue — no fillers, stammers, or false starts. Just the intended message.
3. Write raw dialogue exactly as spoken — including all imperfections.
4. Detect all speech events with precise start and end timestamps:
   - "stammer": syllable or word repetition (e.g., "I-I think", "th-the")
   - "false_start": began a phrase but stopped mid-way before completing it
   - "retake": repeated a phrase cleanly immediately after a mistake
   - "filler": filler words/sounds ("um", "uh", "er", "like", "you know", "so", "basically")
   - "em_dash": hard mid-sentence abrupt stop marked by a dash (—)
   - "long_pause": silence gap within a segment longer than 0.8 seconds between words
   - "breath": audible breath sound before or mid speech

Use word timestamps from the transcript to compute accurate start/end for each speech event.
If word timestamps are not available, estimate from segment timestamps.

Return ONLY valid JSON in this exact structure with no markdown or code blocks:
{
  "speakers": ["Speaker A"],
  "has_speech": true,
  "segments": [
    {
      "start": 0.0,
      "end": 8.3,
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

    async extract(audioPath) {

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

        if (
            !rawTranscript.text ||
            rawTranscript.text.trim() === ""
        ) {

            return {
                audio: audioPath,
                language: null,
                duration:
                    rawTranscript.duration ?? null,
                speakers: [],
                has_speech: false,
                segments: []
            };

        }

        console.log(
            "Analyzing segments and speech events..."
        );

        const structured =
            await this.analyzeTranscript(rawTranscript);

        return {
            audio: audioPath,
            language:
                rawTranscript.language ?? null,
            duration:
                rawTranscript.duration ?? null,
            speakers:
                structured.speakers,
            has_speech:
                structured.has_speech,
            segments:
                structured.segments
        };

    }

    async analyzeTranscript(rawTranscript) {

        const response =
            await this.client.chat.completions.create({
                model:
                    this.textModel,
                messages: [
                    {
                        role: "system",
                        content:
                            ANALYSIS_SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content:
                            JSON.stringify(
                                rawTranscript,
                                null,
                                2
                            )
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
