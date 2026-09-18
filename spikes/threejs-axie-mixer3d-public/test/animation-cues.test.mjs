import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { ThreeAxiePlayableCharacter } from '../dist/three.js';

function sourceEvent(time, label, stringParameter = JSON.stringify({ type: label })) {
  return {
    time,
    functionName: 'ActionCue',
    stringParameter,
    floatParameter: 0,
    intParameter: Math.round(time * 100),
    objectParameterId: label,
  };
}

function animationClip(sourceName, duration, looping, events = []) {
  const clip = new THREE.AnimationClip(`full:${sourceName}`, duration, []);
  clip.userData = {
    axieSourceName: sourceName,
    axieLooping: looping,
    axieEvents: events,
  };
  return clip;
}

function playableWith(clips) {
  const wrapper = new THREE.Group();
  const model = new THREE.Group();
  wrapper.add(model);
  const descriptor = { body: 'normal', color: 0, parts: [] };
  const quality = {
    id: 'cue-test',
    requestedLod: 0,
    textureMaxSize: 1024,
    anisotropy: 1,
    shadows: false,
    geometryOutlines: false,
    mysticEffects: false,
  };
  const plan = {
    key: 'cue-test',
    descriptor,
    quality,
    animationSet: 'full',
    body: { body: 'normal', bounds: { min: [-1, 0, -1], max: [1, 2, 1] } },
    bodyLod: { requestedLod: 0, resolvedLod: 0, asset: {} },
    partRigs: [],
    missingParts: [],
    warnings: [],
  };
  const assembly = {
    wrapper,
    model,
    clips,
    clipSets: { lite: clips, full: clips },
    leases: [],
    ownedMaterials: [],
    addonRuntimes: [],
    diagnostics: {},
  };
  return new ThreeAxiePlayableCharacter(assembly, plan);
}

function fixture(extraClips) {
  return playableWith([
    animationClip('Default.Idle', 1, true),
    ...extraClips,
  ]);
}

test('animation cues emit once when playback crosses each source event', () => {
  const attack = animationClip('Action.Primary.Test', 0.8, false, [
    sourceEvent(0.5, 'late'),
    sourceEvent(0, 'start'),
    sourceEvent(0.25, 'impact', 'not-json'),
    sourceEvent(0.8, 'finish'),
  ]);
  const character = fixture([attack]);
  const cues = [];
  const unsubscribe = character.subscribeAnimationCues((cue) => cues.push(cue));

  assert.equal(character.playAnimation('Action.Primary.Test', {
    transition: 0,
    lockLocomotion: true,
  }), true);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);
  character.update(0.1);

  assert.deepEqual(cues.map((cue) => [cue.clipTime, cue.eventIndex, cue.loop]), [
    [0, 1, 0],
    [0.25, 2, 0],
    [0.5, 0, 0],
    [0.8, 3, 0],
  ]);
  assert.equal(cues[0].sourceName, 'Action.Primary.Test');
  assert.equal(cues[0].runtimeName, 'full:Action.Primary.Test');
  assert.equal(cues[0].payload.type, 'start');
  assert.equal(cues[1].payload, undefined);
  assert.equal(cues[1].sourceEvent.stringParameter, 'not-json');
  assert.equal(Object.isFrozen(cues[0]), true);
  assert.equal(Object.isFrozen(cues[0].sourceEvent), true);

  unsubscribe();
  unsubscribe();
  character.playAnimation('Action.Primary.Test', { transition: 0, restart: true });
  character.update(0.1);
  assert.equal(cues.length, 4);
  character.dispose();
});

test('looping cues survive wraps and preserve the zero-based playback pass', () => {
  const loop = animationClip('Action.Loop.Test', 0.2, true, [
    sourceEvent(0, 'pulse-start'),
    sourceEvent(0.05, 'pulse-a'),
    sourceEvent(0.15, 'pulse-b'),
  ]);
  const character = fixture([loop]);
  const cues = [];
  character.subscribeAnimationCues((cue) => cues.push([cue.payload.type, cue.loop]));

  assert.equal(character.playAnimation('Action.Loop.Test', {
    transition: 0,
    loop: true,
    timeScale: 5,
    lockLocomotion: true,
  }), true);
  // One bounded runtime update advances 0.5 clip seconds: two complete wraps
  // and half of the third pass.
  character.update(0.1);

  assert.deepEqual(cues, [
    ['pulse-start', 0],
    ['pulse-a', 0],
    ['pulse-b', 0],
    ['pulse-start', 1],
    ['pulse-a', 1],
    ['pulse-b', 1],
    ['pulse-start', 2],
    ['pulse-a', 2],
  ]);
  character.dispose();
});

test('action transitions clear the old cue cursor and restarts reset it', () => {
  const first = animationClip('Action.First', 0.4, false, [
    sourceEvent(0.05, 'first-open'),
    sourceEvent(0.15, 'first-late'),
  ]);
  const second = animationClip('Action.Second', 0.4, false, [
    sourceEvent(0.05, 'second-open'),
  ]);
  const character = fixture([first, second]);
  const cues = [];
  character.subscribeAnimationCues((cue) => cues.push(cue.payload.type));

  character.playAnimation('Action.First', { transition: 0, lockLocomotion: true });
  character.update(0.1);
  character.playAnimation('Action.Second', { transition: 0, lockLocomotion: true });
  character.update(0.1);
  character.update(0.1);
  character.playAnimation('Action.First', { transition: 0, restart: true, lockLocomotion: true });
  character.update(0.1);

  assert.deepEqual(cues, ['first-open', 'second-open', 'first-open']);
  assert.throws(() => character.subscribeAnimationCues(null), /must be a function/);
  character.dispose();

  const afterDispose = character.subscribeAnimationCues(() => {
    throw new Error('disposed character must not retain cue listeners');
  });
  assert.doesNotThrow(() => afterDispose());
});
