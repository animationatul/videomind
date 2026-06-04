import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

dotenv.config();

const SYSTEM_PROMPT = `You are VideoMind, an expert video analysis AI.

You receive:
1. A collage image showing video frames organized in rows — each row is one timeline segment
2. Timeline data with transcript information already extracted from audio

COLLAGE STRUCTURE:
- Each row = one timeline segment, in order (Row 1 = Segment 1, Row 2 = Segment 2, etc.)
- Each row shows 3 frames: START | MIDDLE | END
- Row headers show: segment number, time range, speaker, and dialogue snippet

YOUR TASK:
For each timeline segment, examine the corresponding collage row and add these visual fields:
- "description": Specific, detailed description of what is visually happening
- "shot_type": One of — extreme_close_up, close_up, medium_close_up, medium_shot, medium_wide, wide_shot, extreme_wide, over_the_shoulder, point_of_view, two_shot, screen_recording, title_card
- "camera_angle": One of — eye_level, high_angle, low_angle, bird_eye, dutch_angle, over_the_shoulder
- "camera_movement": One of — static, pan, tilt, zoom_in, zoom_out, dolly, tracking, handheld, cut
- "audio_type": One of — speech, music, ambient, silence, narration

For the overall video determine:
- "content_type": One of — tutorial, interview, documentary, cinematic, music_video, screen_recording, vlog, presentation, other
- "summary": 2–3 sentences describing the full video content

Keep all existing fields from each timeline segment exactly as provided (index, start, end, duration, speaker, dialogue, raw_dialogue, speech_events, has_speech_issues). Only add the visual fields listed above.

Return ONLY a valid JSON object with no markdown, no code blocks, no extra text. Match this exact structure:

{
  "video": "<filename>",
  "duration": <seconds>,
  "resolution": "<WxH or null>",
  "fps": <number>,
  "has_audio": <boolean>,
  "has_speech": <boolean>,
  "language": "<language_code or null>",
  "content_type": "<type>",
  "speakers": ["Speaker A"],
  "scene_count": <number>,
  "timeline": [
    {
      "index": 1,
      "start": 0.0,
      "end": 8.3,
      "duration": 8.3,
      "description": "<visual description of this segment>",
      "shot_type": "<type>",
      "camera_angle": "<angle>",
      "camera_movement": "<movement>",
      "audio_type": "<type>",
      "speaker": "<Speaker A or null>",
      "dialogue": "<clean dialogue or null>",
      "raw_dialogue": "<raw dialogue or null>",
      "speech_events": [],
      "has_speech_issues": false
    }
  ],
  "summary": "<2-3 sentence summary>"
}`;

export class LlmAnalyzer {

    constructor() {

        this.client = new OpenAI({
            apiKey:
                process.env.OPENAI_API_KEY,
            baseURL:
                process.env.OPENAI_BASE_URL
        });

        this.model =
            process.env.VISION_MODEL ??
            process.env.TEXT_MODEL;

    }

    async analyze({
        collagePath,
        timeline,
        transcript,
        metadata,
        videoPath
    }) {

        const collageBase64 =
            fs.readFileSync(
                collagePath,
                "base64"
            );

        const contextPayload = {
            video_file:
                path.basename(videoPath),
            metadata,
            has_speech:
                transcript.has_speech,
            language:
                transcript.language ?? null,
            speakers:
                transcript.speakers ?? [],
            timeline
        };

        const response =
            await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(
                                    contextPayload,
                                    null,
                                    2
                                )
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${collageBase64}`
                                }
                            }
                        ]
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
