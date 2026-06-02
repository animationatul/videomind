const MIN_SCENE_GAP = 1.0;

for (const match of matches) {

    const time = parseFloat(match[1]);

    const lastSceneTime =
        scenes[scenes.length - 1];

    if (
        !lastSceneTime ||
        (time - lastSceneTime) > MIN_SCENE_GAP
    ) {
        scenes.push(time);
    }
}
