export class TimelineMerger {

    merge(audioSegments, visualSegments) {

        if (
            !audioSegments ||
            audioSegments.length === 0
        ) {
            return this.fromVisual(visualSegments);
        }

        return audioSegments.map((seg, i) => ({

            index: i + 1,

            start: seg.start,

            end: seg.end,

            duration: Number(
                (seg.end - seg.start).toFixed(3)
            ),

            speaker:
                seg.speaker ?? null,

            dialogue:
                seg.dialogue ?? null,

            raw_dialogue:
                seg.raw_dialogue ?? null,

            speech_events:
                seg.speech_events ?? [],

            has_speech_issues:
                seg.has_speech_issues ?? false

        }));
    }

    fromVisual(visualSegments) {

        return visualSegments.map((scene, i) => ({

            index: i + 1,

            start: scene.start,

            end: scene.end,

            duration: Number(
                (scene.end - scene.start).toFixed(3)
            ),

            speaker: null,

            dialogue: null,

            raw_dialogue: null,

            speech_events: [],

            has_speech_issues: false

        }));
    }

}
