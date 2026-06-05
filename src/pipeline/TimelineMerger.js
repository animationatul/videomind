export class TimelineMerger {

    merge(audioSegments, visualSegments, duration) {

        let timeline;

        if (
            !audioSegments ||
            audioSegments.length === 0
        ) {

            timeline = this.fromVisual(visualSegments);

        }
        else {

            timeline = audioSegments.map((seg, i) => ({

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

        return this.repair(timeline, duration);

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

    /*
    Ensures the timeline always spans exactly 0 → duration,
    regardless of what the scene detector or LLM returned.
    Handles: LLM undershooting, floating-point drift, off-by-one
    from scene detection.
    */
    repair(timeline, duration) {

        if (
            !timeline.length ||
            duration == null
        ) {
            return timeline;
        }

        const pinned = Number(duration.toFixed(3));

        // First segment always starts at the beginning
        timeline[0].start = 0;

        // Last segment always ends at the real video duration
        const last = timeline[timeline.length - 1];
        last.end = pinned;

        // Recompute each segment's duration field
        for (const seg of timeline) {

            seg.duration = Number(
                (seg.end - seg.start).toFixed(3)
            );

        }

        return timeline;

    }

}
