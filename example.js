import { VideoMind }
from "./src/core/VideoMind.js";

const vm =
    new VideoMind({
        keepTempFiles: false
    });

const result =
    await vm.analyzeAssets({
        overwrite: false
    });

console.log(
    JSON.stringify(
        result,
        null,
        2
    )
);
