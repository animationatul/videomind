import sharp from "sharp";
import fs from "fs";

function escapeXml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

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

        const segments =
            this.groupBySegment(frames);

        const segmentBuffers = [];

        let totalHeight = 0;
        let maxWidth = 0;

        for (const segment of segments) {

            try {

                const buffer =
                    await this.createSegmentRow(
                        segment
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
                        "Invalid segment buffer"
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

                segmentBuffers.push({
                    buffer,
                    width: metadata.width,
                    height: metadata.height
                });

            }
            catch (error) {

                console.error(
                    "Segment generation failed:"
                );

                console.error(
                    error.message
                );

            }

        }

        if (segmentBuffers.length === 0) {

            throw new Error(
                "No valid segment images generated"
            );

        }

        const composites = [];
        let currentY = 0;

        for (const seg of segmentBuffers) {

            composites.push({
                input: seg.buffer,
                left: 0,
                top: currentY
            });

            currentY +=
                seg.height + this.sceneGap;
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
            .composite(composites)
            .jpeg({ quality: 95 })
            .toFile(this.output);

        return {
            collage: this.output,
            segmentCount: segments.length
        };
    }

    groupBySegment(frames) {

        const map = new Map();

        for (const frame of frames) {

            if (
                !map.has(frame.segmentIndex)
            ) {
                map.set(
                    frame.segmentIndex,
                    []
                );
            }

            map.get(frame.segmentIndex)
                .push(frame);
        }

        return [...map.values()];
    }

    async createSegmentRow(segmentFrames) {

        const validFrames = [];

        for (const frame of segmentFrames) {

            if (!fs.existsSync(frame.file)) {

                console.warn(
                    `Missing frame: ${frame.file}`
                );

                continue;
            }

            const stats =
                fs.statSync(frame.file);

            if (stats.size === 0) {

                console.warn(
                    `Empty frame: ${frame.file}`
                );

                continue;
            }

            validFrames.push(frame);
        }

        if (validFrames.length === 0) {

            console.warn(
                "No valid frames for segment"
            );

            return null;
        }

        const first = validFrames[0];

        const rowWidth =
            this.frameWidth * validFrames.length;

        const headerHeight = 80;

        const rowHeight =
            this.frameHeight + headerHeight;

        const speakerText =
            first.segmentSpeaker
                ? escapeXml(first.segmentSpeaker)
                : "";

        const dialogueText =
            first.segmentDialogue
                ? `"${escapeXml(
                    first.segmentDialogue.slice(0, 60)
                )}${first.segmentDialogue.length > 60 ? "..." : ""}"`
                : "";

        const headerSvg = `
        <svg width="${rowWidth}" height="${headerHeight}">

            <rect
                width="100%"
                height="100%"
                fill="#1a1a2e"/>

            <text
                x="16"
                y="22"
                font-size="18"
                font-weight="bold"
                fill="#e0e0e0">
                Segment ${first.segmentIndex}
            </text>

            <text
                x="16"
                y="44"
                font-size="13"
                fill="#a0a0b0">
                ${first.segmentStart.toFixed(2)}s &rarr; ${first.segmentEnd.toFixed(2)}s
                ${speakerText ? `&#160;&#160;|&#160;&#160;${speakerText}` : ""}
            </text>

            <text
                x="16"
                y="65"
                font-size="12"
                fill="#c0c0c0">
                ${dialogueText}
            </text>

        </svg>
        `;

        const composites = [
            {
                input:
                    Buffer.from(headerSvg),
                left: 0,
                top: 0
            }
        ];

        for (
            let i = 0;
            i < validFrames.length;
            i++
        ) {

            const frame = validFrames[i];

            console.log(
                "Processing frame:",
                frame.file
            );

            let image;

            try {

                image =
                    await sharp(frame.file)
                        .resize({
                            width:
                                this.frameWidth,
                            height:
                                this.frameHeight - 40,
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
                    font-size="14"
                    font-weight="bold">

                    ${frame.frameType.toUpperCase()}

                </text>

            </svg>
            `;

            const x = i * this.frameWidth;

            composites.push({
                input: Buffer.from(labelSvg),
                left: x,
                top: headerHeight
            });

            composites.push({
                input: image,
                left: x,
                top: headerHeight + 40
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
            .composite(composites)
            .jpeg({ quality: 95 })
            .toBuffer();
    }

}
