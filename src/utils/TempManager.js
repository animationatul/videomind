import fs from "fs";
import path from "path";

export class TempManager {

    constructor(
        tempRoot = "./tmp"
    ) {
        this.tempRoot =
            tempRoot;
    }

    createJob() {

        const id =
            `job_${Date.now()}`;

        const jobPath =
            path.join(
                this.tempRoot,
                id
            );

        const framesPath =
            path.join(
                jobPath,
                "frames"
            );

        fs.mkdirSync(
            framesPath,
            {
                recursive: true
            }
        );

        return {
            id,

            path:
                jobPath,

            framesPath,

            audioPath:
                path.join(
                    jobPath,
                    "audio.wav"
                ),

            collagePath:
                path.join(
                    jobPath,
                    "collage.jpg"
                )
        };
    }

    cleanJob(
        jobPath
    ) {

        if (
            fs.existsSync(
                jobPath
            )
        ) {

            fs.rmSync(
                jobPath,
                {
                    recursive: true,
                    force: true
                }
            );

        }

    }

    cleanAll() {

        if (
            fs.existsSync(
                this.tempRoot
            )
        ) {

            fs.rmSync(
                this.tempRoot,
                {
                    recursive: true,
                    force: true
                }
            );

        }

    }

}
