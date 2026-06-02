import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export class FrameExtractor {

    constructor(outputDir) {
        this.outputDir = outputDir;
    }

    async extract(videoPath, scenes) {

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(
                this.outputDir,
                { recursive: true }
            );
        }

        const frames = [];

        for (const scene of scenes) {

            const sceneFrames = [
                {
                    type: "start",
                    time: scene.start
                },
                {
                    type: "middle",
                    time:
                        (scene.start + scene.end) / 2
                },
                {
                    type: "end",
                    time: scene.end
                }
            ];

            for (const frame of sceneFrames) {

                const outputFile =
                    path.join(
                        this.outputDir,
                        `scene_${scene.id}_${frame.type}.jpg`
                    );

                await this.extractFrame(
                    videoPath,
                    frame.time,
                    outputFile
                );
                if (!fs.existsSync(outputFile)) {

                    console.log(
                        `Frame not created: ${outputFile}`
                    );

                    continue;
                }

                const stats =
                    fs.statSync(outputFile);

                console.log(
                    `Frame: ${outputFile} Size: ${stats.size}`
                );

                if (stats.size === 0) {

                    console.log(
                        `Empty frame: ${outputFile}`
                    );

                    continue;
                }
                frames.push({
                    sceneId: scene.id,
                    sceneName: `Scene ${scene.id}`,

                    sceneStart: scene.start,
                    sceneEnd: scene.end,

                    frameType: frame.type,

                    timestamp: Number(
                        frame.time.toFixed(3)
                    ),

                    timestampFormatted:
                        this.formatTime(
                            frame.time
                        ),

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
            (seconds % 60)
                .toFixed(3);

        return `${hrs
            .toString()
            .padStart(2, "0")}:${mins
            .toString()
            .padStart(2, "0")}:${secs
            .padStart(6, "0")}`;
    }

}
