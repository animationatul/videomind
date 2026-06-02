import sharp from "sharp";
import fs from "fs";

export class CollageGenerator {

    constructor(options = {}) {

        this.output =
            options.output;

        this.frameWidth =
            options.frameWidth ?? 250;

        this.frameHeight =
            options.frameHeight ?? 400;

        this.sceneGap =
            options.sceneGap ?? 40;
    }

    async generate(frames) {

        const scenes =
            this.groupByScene(
                frames
            );

        const sceneBuffers = [];

        let totalHeight = 0;
        let maxWidth = 0;

        for (const scene of scenes) {

            try {

                const buffer =
                    await this.createSceneRow(
                        scene
                    );

                if (!buffer) {
                    continue;
                }

                const metadata =
                    await sharp(buffer)
                        .metadata();

                if (
                    !metadata.width ||
                    !metadata.height
                ) {

                    console.warn(
                        "Invalid scene buffer"
                    );

                    continue;
                }

                totalHeight +=
                    metadata.height +
                    this.sceneGap;

                maxWidth =
                    Math.max(
                        maxWidth,
                        metadata.width
                    );

                sceneBuffers.push({
                    buffer,
                    width:
                        metadata.width,
                    height:
                        metadata.height
                });

            }
            catch (error) {

                console.error(
                    "Scene generation failed:"
                );

                console.error(
                    error.message
                );

            }

        }

        if (
            sceneBuffers.length === 0
        ) {

            throw new Error(
                "No valid scene images generated"
            );

        }

        const composites = [];

        let currentY = 0;

        for (
            const scene of sceneBuffers
        ) {

            composites.push({
                input:
                    scene.buffer,
                left: 0,
                top: currentY
            });

            currentY +=
                scene.height +
                this.sceneGap;
        }

        await sharp({
            create: {
                width: maxWidth,
                height: totalHeight,
                channels: 3,
                background: {
                    r: 255,
                    g: 255,
                    b: 255
                }
            }
        })
            .composite(
                composites
            )
            .jpeg({
                quality: 95
            })
            .toFile(
                this.output
            );

        return {
            collage:
                this.output,
            sceneCount:
                scenes.length
        };
    }

    groupByScene(frames) {

        const map =
            new Map();

        for (const frame of frames) {

            if (
                !map.has(
                    frame.sceneId
                )
            ) {

                map.set(
                    frame.sceneId,
                    []
                );

            }

            map.get(
                frame.sceneId
            ).push(
                frame
            );

        }

        return [...map.values()];
    }

    async createSceneRow(
        sceneFrames
    ) {

        const validFrames = [];

        for (
            const frame of sceneFrames
        ) {

            if (
                !fs.existsSync(
                    frame.file
                )
            ) {

                console.warn(
                    `Missing frame: ${frame.file}`
                );

                continue;
            }

            const stats =
                fs.statSync(
                    frame.file
                );

            if (
                stats.size === 0
            ) {

                console.warn(
                    `Empty frame: ${frame.file}`
                );

                continue;
            }

            validFrames.push(
                frame
            );
        }

        if (
            validFrames.length === 0
        ) {

            console.warn(
                "No valid frames found for scene"
            );

            return null;
        }

        const first =
            validFrames[0];

        const rowWidth =
            this.frameWidth *
            validFrames.length;

        const rowHeight =
            this.frameHeight + 80;

        const headerSvg = `
        <svg width="${rowWidth}" height="80">

            <rect
                width="100%"
                height="100%"
                fill="#f0f0f0"/>

            <text
                x="20"
                y="30"
                font-size="24"
                font-weight="bold">

                ${first.sceneName}

            </text>

            <text
                x="20"
                y="60"
                font-size="18">

                ${first.sceneStart.toFixed(2)}s
                →
                ${first.sceneEnd.toFixed(2)}s

            </text>

        </svg>
        `;

        const composites = [
            {
                input:
                    Buffer.from(
                        headerSvg
                    ),
                left: 0,
                top: 0
            }
        ];

        for (
            let i = 0;
            i < validFrames.length;
            i++
        ) {

            const frame =
                validFrames[i];

            console.log(
                "Processing frame:",
                frame.file
            );

            let image;

            try {

                image =
                    await sharp(
                        frame.file
                    )
                        .resize({
                            width:
                                this.frameWidth,

                            height:
                                this.frameHeight -
                                40,

                            fit: "contain",

                            background: {
                                r: 255,
                                g: 255,
                                b: 255
                            }
                        })
                        .toBuffer();

            }
            catch (error) {

                console.error(
                    `Bad frame: ${frame.file}`
                );

                console.error(
                    error.message
                );

                continue;
            }

            const labelSvg = `
            <svg
                width="${this.frameWidth}"
                height="40">

                <rect
                    width="100%"
                    height="100%"
                    fill="#ffffff"/>

                <text
                    x="10"
                    y="25"
                    font-size="16"
                    font-weight="bold">

                    ${frame.frameType.toUpperCase()}

                </text>

            </svg>
            `;

            const x =
                i *
                this.frameWidth;

            composites.push({
                input:
                    Buffer.from(
                        labelSvg
                    ),
                left: x,
                top: 80
            });

            composites.push({
                input: image,
                left: x,
                top: 120
            });

        }

        return await sharp({
            create: {
                width: rowWidth,
                height: rowHeight,
                channels: 3,
                background: {
                    r: 255,
                    g: 255,
                    b: 255
                }
            }
        })
            .composite(
                composites
            )
            .jpeg({
                quality: 95
            })
            .toBuffer();
    }

}
