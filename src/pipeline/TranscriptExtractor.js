import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

/*
Used when the transcript already has word/segment timestamps (verbose_json).
The LLM handles both segmentation and analysis since it has precise timing.
*/
const ANALYSIS_SYSTEM_PROMPT = `You are a professional video transcript analyzer.

You receive a raw transcript with word/segment timestamps and the total audio duration.
Your job is to group the speech into timed segments and return structured data for each one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SENTENCE BOUNDARIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sentence-ending punctuation marks where a sentence ends:
  . ! ? । ॥ ؟ ！ 。 ？

These are the ONLY valid points to end a segment or detect a pause.
Never cut mid-sentence. Never cut at a comma, colon, or semicolon.
Use the word timestamps at these punctuation positions to get the exact time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Group sentences into segments of 20–60 seconds using word timestamps.
Close a segment only when the accumulated duration reaches 20s AND the
current sentence ends at a punctuation boundary listed above.
First segment start = 0.000. Last segment end = [TOTAL_DURATION] exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start / end
   — use the word timestamps at the segment boundaries

2. speaker
   — "Speaker A", "Speaker B", etc. Single voice = always "Speaker A"

3. dialogue
   — remove only speech disfluencies: fillers, stammers, false starts, retakes
   — PRESERVE every sentence-ending punctuation mark (। . ! ?) exactly as spoken
   — never replace । with , or any other character
   — never merge two sentences by removing the punctuation between them

4. raw_dialogue
   — verbatim as transcribed, character-for-character
   — includes all disfluencies and punctuation exactly as they appear

5. speech_events
   Use word timestamps to pinpoint each event precisely.
   Event types:
     "stammer"     : syllable or word repetition ("I-I", "th-the", "की की")
     "false_start" : phrase begun but abandoned before completing
     "retake"      : phrase repeated cleanly right after a mistake
     "filler"      : filler words — English: "um", "uh", "like", "you know", "so"
                                    Hindi:   "तो", "मतलब", "बस", "अरे", "हाँ", "ना"
     "em_dash"     : hard mid-sentence abrupt stop (—)
     "long_pause"  : silence > 0.8s between words (use word timestamps to detect)
     "breath"      : audible breath sound
   Each event: { "type", "start", "end", "text" }

6. has_speech_issues
   — true if speech_events is non-empty, false otherwise

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — valid JSON only, no markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

You receive an array of transcript segments. Each segment has:
  - text  : the spoken words (may contain multiple sentences)
  - start : segment start time in seconds — DO NOT change
  - end   : segment end time in seconds — DO NOT change

Your only job is to analyze the content of each segment.
Do NOT re-segment, merge, or split. Do NOT change start or end.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SENTENCE BOUNDARIES IN THE TEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each text field may contain multiple sentences. Sentence-ending punctuation:
  . ! ? । ॥ ؟ ！ 。 ？

These marks show exactly where one sentence ends and the next begins.
Use them as your primary guide for:
  — understanding the structure of the spoken content
  — estimating where within the segment each word or event occurs
  — identifying pauses between sentences

To estimate the time of any position in the text:
  position_time = start + (chars_before_position / total_segment_chars) × (end − start)

A sentence-ending mark means the speaker paused there. If the gap between two
sentences looks long relative to the text around it, flag it as a "long_pause".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOR EACH SEGMENT, RETURN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. start
   — copy the exact value from input, unchanged

2. end
   — copy the exact value from input, unchanged

3. speaker
   — "Speaker A", "Speaker B", etc.
   — Single voice = always "Speaker A"

4. dialogue
   — remove only true speech disfluencies: fillers, stammers, false starts, retakes
   — KEEP every sentence-ending punctuation mark (। . ! ?) exactly as it appears
   — NEVER replace । with , or any other character
   — NEVER merge sentences by removing the punctuation between them
   — NEVER add punctuation that isn't in the original text

5. raw_dialogue
   — must be character-for-character identical to the input text field
   — copy it exactly, no changes whatsoever

6. speech_events
   Detect all of the following within this segment:
     "stammer"     : syllable or word repetition ("I-I", "th-the", "की की", "पूरी की पूरी")
     "false_start" : phrase begun but abandoned before completing the thought
     "retake"      : phrase cleanly repeated right after a mistake
     "filler"      : filler words/sounds:
                     English — "um", "uh", "er", "like", "you know", "so", "basically"
                     Hindi   — "तो", "मतलब", "बस", "अरे", "हाँ", "ना", "वो"
     "em_dash"     : hard mid-sentence abrupt stop marked by — or a sudden cut
     "long_pause"  : silence longer than 0.8s, typically at a sentence boundary (।)
                     or between two distinct thoughts
     "breath"      : audible breath sound before or during speech

   For each event, estimate start and end using the character-position formula:
     event_start = segment.start + (chars_before_event / total_chars) × duration
     event_end   = segment.start + (chars_after_event  / total_chars) × duration

   Each event: { "type", "start", "end", "text" }

7. has_speech_issues
   — true if speech_events is non-empty, false otherwise

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — valid JSON only, no markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "speakers": ["Speaker A"],
  "has_speech": true,
  "segments": [
    {
      "start": 0.0,
      "end": 23.0,
      "speaker": "Speaker A",
      "dialogue": "2026 में कोडिंग सीखना सबसे बड़ी गलती हो सकती है। और मैं बताता हूँ क्यों।",
      "raw_dialogue": "2026 में कोडिंग सीखना एक सबसे बड़ी गलती हो सकती है। और मैं बताता हूँ क्यों।",
      "speech_events": [
        { "type": "filler", "start": 8.2, "end": 8.7, "text": "तो" }
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
