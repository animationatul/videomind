import fs from "fs";
import path from "path";

import { TempManager }
from "../utils/TempManager.js";

import { SceneDetector }
from "../pipeline/SceneDetector.js";

import { FrameExtractor }
from "../pipeline/FrameExtractor.js";

import { AudioExtractor }
from "../pipeline/AudioExtractor.js";

import { CollageGenerator }
from "../pipeline/CollageGenerator.js";

import { LlmAnalyzer }
from "../pipeline/LlmAnalyzer.js";

export class VideoMind {

    constructor(options = {}) {

        this.keepTempFiles =
            options.keepTempFiles ??
            false;

        this.temp =
            new TempManager();

    }

    async analyze(videoPath) {

        const job =
            this.temp.createJob();

        console.log(
            `\nAnalyzing: ${videoPath}\n`
        );

        const scenes =
            await new SceneDetector()
                .detect(videoPath);
                console.log(
                    JSON.stringify(
                        scenes,
                        null,
                        2
                    )
                );
        const frames =
            await new FrameExtractor(
                job.framesPath
            ).extract(
                videoPath,
                scenes.scenes
            );

        await new CollageGenerator({
            output:
                job.collagePath
        }).generate(
            frames.frames
        );

        const audio =
            await new AudioExtractor(
                job.audioPath
            ).extract(
                videoPath
            );

        const result =
            await new LlmAnalyzer()
                .analyze({
                    collagePath:
                        job.collagePath,

                    audioPath:
                        audio.audio,

                    sceneData:
                        scenes
                });

        /*
        ----------------------------------
        SAVE VAF FILE
        ----------------------------------
        */

        const fileName =
            path.basename(
                videoPath,
                path.extname(videoPath)
            );

        const vafDir =
            "./assets/vaf";

        fs.mkdirSync(
            vafDir,
            {
                recursive: true
            }
        );

        const vafPath =
            path.join(
                vafDir,
                `${fileName}.vaf.json`
            );

        fs.writeFileSync(
            vafPath,
            result,
            "utf8"
        );

        console.log(
            `VAF Saved: ${vafPath}`
        );

        /*
        ----------------------------------
        CLEAN TEMP
        ----------------------------------
        */

        if (
            !this.keepTempFiles
        ) {

            this.temp.cleanJob(
                job.path
            );

        }

        return {
            video:
                videoPath,

            vaf:
                vafPath
        };

    }


    async analyzeAssets(options = {}) {

    const videosFolder =
        options.videosFolder ??
        "./assets/videos";

    const overwrite =
        options.overwrite ??
        false;

    const files =
        fs.readdirSync(
            videosFolder
        );

    const videoFiles =
        files.filter(file => {

            const ext =
                path.extname(file)
                    .toLowerCase();

            return [
                ".mp4",
                ".mov",
                ".mkv",
                ".avi",
                ".webm"
            ].includes(ext);

        });

    const results = [];

    for (const file of videoFiles) {

        const videoPath =
            path.join(
                videosFolder,
                file
            );

        const fileName =
            path.basename(
                file,
                path.extname(file)
            );

        const vafPath =
            path.join(
                "./assets/vaf",
                `${fileName}.vaf.json`
            );

        if (
            !overwrite &&
            fs.existsSync(
                vafPath
            )
        ) {

            console.log(
                `Skipping ${file} (VAF exists)`
            );

            results.push({
                video:
                    videoPath,

                vaf:
                    vafPath,

                status:
                    "skipped"
            });

            continue;
        }

        console.log(
            `Processing ${file}`
        );

        try {

            const result =
                await this.analyze(
                    videoPath
                );

            results.push({
                ...result,
                status:
                    "completed"
            });

        }
        catch (error) {

            console.error(
                `Failed: ${file}`
            );

            results.push({
                video:
                    videoPath,

                status:
                    "failed",

                error:
                    error.message
            });

        }

    }

    return {
        total:
            videoFiles.length,

        processed:
            results.filter(
                x => x.status === "completed"
            ).length,

        skipped:
            results.filter(
                x => x.status === "skipped"
            ).length,

        failed:
            results.filter(
                x => x.status === "failed"
            ).length,

        results
    };

}

}
