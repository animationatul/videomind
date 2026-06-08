import { spawn } from "child_process";

export class SceneDetector {

    constructor(
        threshold = 0.4
    ) {

        this.threshold =
            threshold;

    }

    async detect(
        videoPath
    ) {

        return new Promise(
            (resolve, reject) => {

                const sceneTimes = [];

                const ffmpeg =
                    spawn(
                        "ffmpeg",
                        [
                            "-i",
                            videoPath,
                            "-filter:v",
                            `select='gt(scene,${this.threshold})',showinfo`,
                            "-f",
                            "null",
                            "-"
                        ]
                    );

                ffmpeg.stderr.on(
                    "data",
                    data => {

                        const text =
                            data.toString();

                        const matches =
                            text.matchAll(
                                /pts_time:([0-9.]+)/g
                            );

                        const MIN_SCENE_GAP = 1.0;

                        for (
                            const match of matches
                        ) {

                            const time =
                                parseFloat(
                                    match[1]
                                );

                            const last =
                                sceneTimes[
                                    sceneTimes.length - 1
                                ];

                            if (
                                !last ||
                                (
                                    time - last
                                ) >
                                MIN_SCENE_GAP
                            ) {

                                sceneTimes.push(
                                    time
                                );

                            }

                        }

                    }
                );

                ffmpeg.on(
                    "close",
                    async () => {

                        try {

                            const duration =
                                await this.getDuration(
                                    videoPath
                                );

                            const scenes = [];

                            let start = 0;

                            let id = 1;

                            for (
                                const cut of sceneTimes
                            ) {

                                scenes.push({
                                    id,

                                    start:
                                        Number(
                                            start.toFixed(
                                                3
                                            )
                                        ),

                                    end:
                                        Number(
                                            cut.toFixed(
                                                3
                                            )
                                        )
                                });

                                start =
                                    cut;

                                id++;

                            }

                            if (
                                sceneTimes.length > 0
                            ) {

                                scenes.push({
                                    id,

                                    start:
                                        Number(
                                            start.toFixed(
                                                3
                                            )
                                        ),

                                    end:
                                        Number(
                                            duration.toFixed(
                                                3
                                            )
                                        )
                                });

                            }

                            /*
                            ----------------------------------
                            FALLBACK SCENE
                            ----------------------------------
                            */

                            if (
                                scenes.length === 0
                            ) {

                                console.warn(
                                    "No scene changes detected. Creating fallback scene."
                                );

                                scenes.push({
                                    id: 1,

                                    start: 0,

                                    end:
                                        Number(
                                            duration.toFixed(
                                                3
                                            )
                                        )
                                });

                            }

                            resolve({
                                video:
                                    videoPath,

                                sceneCount:
                                    scenes.length,

                                scenes
                            });

                        }
                        catch (error) {

                            reject(
                                error
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

    async getDuration(
        videoPath
    ) {

        return new Promise(
            (resolve, reject) => {

                const ffprobe =
                    spawn(
                        "ffprobe",
                        [
                            "-v",
                            "error",

                            "-show_entries",
                            "format=duration",

                            "-of",
                            "default=noprint_wrappers=1:nokey=1",

                            videoPath
                        ]
                    );

                let output = "";

                ffprobe.stdout.on(
                    "data",
                    data => {

                        output +=
                            data.toString();

                    }
                );

                ffprobe.on(
                    "close",
                    () => {

                        const duration =
                            parseFloat(
                                output
                            );

                        resolve(
                            duration
                        );

                    }
                );

                ffprobe.on(
                    "error",
                    reject
                );

            }
        );

    }

    async getMetadata(videoPath) {

        return new Promise(
            (resolve, reject) => {

                const ffprobe =
                    spawn(
                        "ffprobe",
                        [
                            "-v",
                            "error",
                            "-show_entries",
                            "stream=width,height,r_frame_rate,codec_type,start_time:format=start_time,duration",
                            "-of",
                            "json",
                            videoPath
                        ]
                    );

                let output = "";

                ffprobe.stdout.on(
                    "data",
                    data => {
                        output +=
                            data.toString();
                    }
                );

                ffprobe.on(
                    "close",
                    () => {

                        try {

                            const info =
                                JSON.parse(output);

                            const videoStream =
                                info.streams.find(
                                    s => s.codec_type === "video"
                                );

                            const audioStream =
                                info.streams.find(
                                    s => s.codec_type === "audio"
                                );

                            let fps = 0;

                            if (
                                videoStream?.r_frame_rate
                            ) {

                                const [num, den] =
                                    videoStream.r_frame_rate
                                        .split("/");

                                fps = Math.round(
                                    parseInt(num) /
                                    parseInt(den)
                                );

                            }

                            const rawAudioStart =
                                audioStream?.start_time ??
                                info.format?.start_time ??
                                "0";

                            const audioStartTime =
                                rawAudioStart === "N/A"
                                    ? 0
                                    : Number(
                                        parseFloat(rawAudioStart).toFixed(3)
                                    );

                            resolve({
                                duration: Number(
                                    parseFloat(
                                        info.format?.duration ?? 0
                                    ).toFixed(3)
                                ),

                                resolution: videoStream
                                    ? `${videoStream.width}x${videoStream.height}`
                                    : null,

                                fps,

                                has_audio:
                                    !!audioStream,

                                audio_start_time:
                                    audioStartTime
                            });

                        }
                        catch (err) {

                            reject(err);

                        }

                    }
                );

                ffprobe.on(
                    "error",
                    reject
                );

            }
        );

    }

}
