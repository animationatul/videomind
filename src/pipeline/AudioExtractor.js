import { spawn } from "child_process";

export class AudioExtractor {

  constructor(output) {
      this.output = output;
  }

    async extract(videoPath) {

        return new Promise(
            (resolve, reject) => {

                const ffmpeg = spawn(
                    "ffmpeg",
                    [
                        "-y",
                        "-i",
                        videoPath,

                        "-vn",

                        "-ac",
                        "1",

                        "-b:a",
                        "64k",

                        this.output
                    ]
                );

                ffmpeg.on(
                    "close",
                    (code) => {

                        if (code === 0) {

                            resolve({
                                video: videoPath,
                                audio: this.output
                            });

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

}
