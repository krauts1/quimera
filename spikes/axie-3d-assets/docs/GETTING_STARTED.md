# Getting started

You do not need to understand rigging to use these characters. Pick a GLB, get it visible, play `Idle`, and only then add movement or gameplay.

## Pick a first character

For a quick test, start with `assets/mascots/kotaro.glb` or `assets/sapidae/sapidae-f-a.glb`. Each file already contains its textures, skeleton, and animation clips.

## Three.js

Install Three.js:

```sh
npm install three@0.178.0
```

Load a character and play `Idle`:

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const clock = new THREE.Clock();
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/assets/kotaro.glb');

scene.add(gltf.scene);

const mixer = new THREE.AnimationMixer(gltf.scene);
const idle = THREE.AnimationClip.findByName(gltf.animations, 'Idle');
mixer.clipAction(idle).play();

function frame() {
  mixer.update(clock.getDelta());
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

frame();
```

To switch animations, find another clip by name, stop or fade out the current action, and play the new action.

## Godot 4

1. Copy the GLB into your Godot project.
2. Double-click it in the FileSystem panel to inspect the imported scene.
3. Drag the imported scene into your level.
4. Find its `AnimationPlayer` and play `Idle`.
5. Use `Walk` while your character is moving and `Run` at higher speed.

If you need to add scripts or collision shapes without changing the imported file, right-click the GLB and create an inherited scene.

## Unity

Unity needs a glTF importer that preserves skins and animation clips, such as [UnityGLTF](https://github.com/KhronosGroup/UnityGLTF).

1. Install and verify your glTF importer.
2. Add one GLB to the Assets panel.
3. Place the imported character prefab in a scene.
4. Confirm that `Idle`, `Walk`, and `Run` appear as animation clips.
5. Add those clips to an Animator Controller and connect transitions between them.

Test one character before importing the full pack so you can settle scale, materials, and your Animator setup once.

## Blender

1. Choose **File → Import → glTF 2.0**.
2. Select a GLB.
3. Switch to the Animation workspace.
4. Select the armature.
5. Use the Dope Sheet's Action Editor to choose `Idle`, `Walk`, or `Run`.

When exporting your edited version, keep animations enabled and use GLB so textures remain bundled.

## A simple game-development loop

1. Show one character in an empty level.
2. Make `Idle` play automatically.
3. Add player movement and switch between `Idle`, `Walk`, and `Run`.
4. Add a camera and one clear objective.
5. Playtest before adding more systems or artwork.

AI tools are most useful when you give them one small, testable request at a time. Include your engine version, the exact error, and the clip name you are trying to play. Ask the tool to explain each changed file so you can keep the project understandable.

## Common fixes

### The character is too large or too small

Adjust the root object's scale in your engine. Keep the skeleton and child meshes together.

### The model is visible but does not animate

Confirm that you created an animation player or mixer for the imported character and selected a clip that actually exists. Clip names are case-sensitive.

### The textures look washed out

Use an sRGB color texture and a color-managed renderer. In Three.js, set `renderer.outputColorSpace = THREE.SRGBColorSpace`.

### The character slides while walking

These are visual animation clips. Move the gameplay character with your controller and use the animation to match that speed.

### A combat clip looks like it is holding an invisible item

Some mascot combat clips were authored for equipment. Start with the base movement clips, or add the matching static equipment model as an advanced engine-specific attachment.
