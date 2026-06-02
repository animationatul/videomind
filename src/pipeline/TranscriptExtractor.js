import { pipeline } from "@xenova/transformers";

export class TranscriptExtractor {

    constructor(options = {}) {

        this.model =
            options.model ??
            "Xenova/whisper-small";

        this.transcriber =
            null;
    }

    async load() {

        if (
            this.transcriber
        ) {
            return;
        }

        console.log(
            "Loading Whisper model..."
        );

        this.transcriber =
            await pipeline(
                "automatic-speech-recognition",
                this.model
            );

        console.log(
            "Whisper model loaded."
        );
    }

    async transcribe(audioFile) {

        await this.load();

        const result =
            await this.transcriber(
                audioFile
            );

        return {
            audio: audioFile,
            text:
                result.text
        };
    }

}
