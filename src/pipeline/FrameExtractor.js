import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export class FrameExtractor {

    constructor(outputDir) {
        this.outputDir = outputDir;
    }

    async extract(videoPath, timeline) {

        if (
            !fs.existsSync(this.outputDir)
        ) {
            fs.mkdirSync(
                this.outputDir,
                { recursive: true }
            );
        }

        const frames = [];

        for (const segment of timeline) {

            const endTime = Math.max(
                segment.start + 0.1,
                segment.end - 0.1
            );

            const segmentFrames = [
                {
                    type: "start",
                    time: segment.start
                },
                {
                    type: "middle",
                    time:
                        (segment.start + segment.end) / 2
                },
                {
                    type: "end",
                    time: endTime
                }
            ];

            for (const frame of segmentFrames) {

                const outputFile =
                    path.join(
                        this.outputDir,
                        `segment_${segment.index}_${frame.type}.jpg`
                    );

                await this.extractFrame(
                    videoPath,
                    frame.time,
                    outputFile
                );

                if (
                    !fs.existsSync(outputFile)
                ) {

                    console.log(
                        `Frame not created: ${outputFile}`
                    );

                    continue;
                }

                const stats =
                    fs.statSync(outputFile);

                if (stats.size === 0) {

                    console.log(
                        `Empty frame: ${outputFile}`
                    );

                    continue;
                }

                console.log(
                    `Frame: ${outputFile} Size: ${stats.size}`
                );

                frames.push({
                    segmentIndex:
                        segment.index,

                    segmentStart:
                        segment.start,

                    segmentEnd:
                        segment.end,

                    segmentSpeaker:
                        segment.speaker ?? null,

                    segmentDialogue:
                        segment.dialogue ?? null,

                    frameType:
                        frame.type,

                    timestamp: Number(
                        frame.time.toFixed(3)
                    ),

                    timestampFormatted:
                        this.formatTime(frame.time),

                    file: outputFile
                });
            }
        }

        return {
            video: videoPath,
            frameCount: frames.length,
            frames
        };
    }

    async extractFrame(
        videoPath,
        timestamp,
        outputFile
    ) {

        return new Promise(
            (resolve, reject) => {

                const ffmpeg = spawn(
                    "ffmpeg",
                    [
                        "-y",
                        "-ss",
                        String(timestamp),
                        "-i",
                        videoPath,
                        "-frames:v",
                        "1",
                        outputFile
                    ]
                );

                ffmpeg.on(
                    "close",
                    (code) => {
                        if (code === 0) {
                            resolve();
                        } else {
                            reject(
                                new Error(
                                    `FFmpeg exited with code ${code}`
                                )
                            );
                        }
                    }
                );

                ffmpeg.on(
                    "error",
                    reject
                );

            }
        );
    }

    formatTime(seconds) {

        const hrs =
            Math.floor(seconds / 3600);

        const mins =
            Math.floor(
                (seconds % 3600) / 60
            );

        const secs =
            (seconds % 60).toFixed(3);

        return `${hrs
            .toString()
            .padStart(2, "0")}:${mins
            .toString()
            .padStart(2, "0")}:${secs
            .padStart(6, "0")}`;
    }

}
