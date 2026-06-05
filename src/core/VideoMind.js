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

import { TranscriptExtractor }
from "../pipeline/TranscriptExtractor.js";

import { TimelineMerger }
from "../pipeline/TimelineMerger.js";

export class VideoMind {

    constructor(options = {}) {

        this.keepTempFiles =
            options.keepTempFiles ??
            false;

        this.temp =
            new TempManager();

        this.videoFolder =
            "./assets/videos";

        this.vafFolder =
            "./assets/vaf";

    }

    setVideoFolder(folderPath) {
        this.videoFolder = folderPath;
        return this;
    }

    setVafFolder(folderPath) {
        this.vafFolder = folderPath;
        return this;
    }

    async analyze(videoPath) {

        const job =
            this.temp.createJob();

        console.log(
            `\nAnalyzing: ${videoPath}\n`
        );

        /*
        ----------------------------------
        STEP 1: GET METADATA
        Must run first — has_audio decides
        whether audio extraction runs at all
        ----------------------------------
        */

        const metadata =
            await new SceneDetector()
                .getMetadata(videoPath);

        /*
        ----------------------------------
        STEP 2: EXTRACT AUDIO
        Skipped for videos with no audio
        track (B-roll, timelapse, etc.)
        ----------------------------------
        */

        let audio = null;

        if (metadata.has_audio) {

            audio =
                await new AudioExtractor(
                    job.audioPath
                ).extract(videoPath);

        }

        /*
        ----------------------------------
        STEP 3+4: TRANSCRIBE + SCENE DETECT
        (parallel — both independent)
        Transcription skipped when no audio
        ----------------------------------
        */

        const emptyTranscript = {
            audio: null,
            language: null,
            duration: metadata.duration,
            speakers: [],
            has_speech: false,
            segments: []
        };

        const [
            transcript,
            scenes
        ] = await Promise.all([

            metadata.has_audio
                ? new TranscriptExtractor()
                    .extract(audio.audio, metadata.duration)
                : Promise.resolve(emptyTranscript),

            new SceneDetector()
                .detect(videoPath)

        ]);

        console.log(
            `Transcript segments: ${transcript.segments.length}`
        );

        console.log(
            `Visual scenes: ${scenes.sceneCount}`
        );

        /*
        ----------------------------------
        STEP 5: MERGE INTO UNIFIED TIMELINE
        Duration passed so the merger can
        clamp the timeline to the real span
        ----------------------------------
        */

        const timeline =
            new TimelineMerger().merge(
                transcript.segments,
                scenes.scenes,
                metadata.duration
            );

        console.log(
            `Timeline segments: ${timeline.length}`
        );

        /*
        ----------------------------------
        STEP 6: EXTRACT FRAMES
        ----------------------------------
        */

        const frames =
            await new FrameExtractor(
                job.framesPath
            ).extract(
                videoPath,
                timeline
            );

        /*
        ----------------------------------
        STEP 7: GENERATE COLLAGE
        ----------------------------------
        */

        await new CollageGenerator({
            output: job.collagePath
        }).generate(frames.frames);

        /*
        ----------------------------------
        STEP 8: FINAL LLM ANALYSIS → VAF
        ----------------------------------
        */

        const vaf =
            await new LlmAnalyzer()
                .analyze({
                    collagePath:
                        job.collagePath,
                    timeline,
                    transcript,
                    metadata,
                    videoPath
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

        fs.mkdirSync(
            this.vafFolder,
            { recursive: true }
        );

        const vafPath =
            path.join(
                this.vafFolder,
                `${fileName}.vaf.json`
            );

        fs.writeFileSync(
            vafPath,
            JSON.stringify(vaf, null, 2),
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

        if (!this.keepTempFiles) {

            this.temp.cleanJob(job.path);

        }

        return {
            video: videoPath,
            vaf: vafPath
        };

    }

    async analyzeAssets(options = {}) {

        const overwrite =
            options.overwrite ?? false;

        const files =
            fs.readdirSync(
                this.videoFolder
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
                    this.videoFolder,
                    file
                );

            const fileName =
                path.basename(
                    file,
                    path.extname(file)
                );

            const vafPath =
                path.join(
                    this.vafFolder,
                    `${fileName}.vaf.json`
                );

            if (
                !overwrite &&
                fs.existsSync(vafPath)
            ) {

                console.log(
                    `Skipping ${file} (VAF exists)`
                );

                results.push({
                    video: videoPath,
                    vaf: vafPath,
                    status: "skipped"
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
                    status: "completed"
                });

            }
            catch (error) {

                console.error(
                    `Failed: ${file}`,
                    error.message
                );

                results.push({
                    video: videoPath,
                    status: "failed",
                    error: error.message
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
