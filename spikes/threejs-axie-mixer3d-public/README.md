# Three.js Axie Mixer 3D

A Three.js toolkit for assembling, animating, and rendering modular 3D Axies in
browser games. This repository contains the TypeScript runtime, a small browser
sandbox, and the versioned asset pack required by the runtime.

## Status

This is a public alpha intended for Axie Vibeathon and other projects explicitly
approved by Sky Mavis. It is not an npm release and it is not offered under an
open-source license. Read [RIGHTS.md](./RIGHTS.md) before using or redistributing
the code or assets.

The bundled content pack contains 5,821 integrity-sealed files. Keep
`content-integrity.json` with the assets and run `npm run test:content` after
copying or changing them.

## Requirements

- Node.js `20.19+` or `22.12+`
- npm
- a modern browser with WebGL 2 support
- Three.js `0.178.x`
- an approved Sky Mavis API key only if you want to resolve an Axie by ID

The API key is optional when your application already has genes and uses
`createFromGenes`.

## Quickstart

```sh
git clone https://github.com/jaatster/threejs-axie-mixer3d-public.git
cd threejs-axie-mixer3d-public
npm ci
cp .env.example .env.local
# Add SKY_MAVIS_API_KEY to .env.local only if you need Axie-ID lookup.
npm run dev
```

Open `http://127.0.0.1:5173/`. The local Vite middleware reads the API key on
the server side. The browser bundle never receives it.

Before integrating the toolkit, run:

```sh
npm test
```

## Use the mixer

Install a reviewed Git revision and copy the bundled content into your app:

```sh
npm install github:jaatster/threejs-axie-mixer3d-public#<reviewed-commit> three@0.178.0
npx axie-mixer-copy-assets public/assets/axie
```

Create an Axie when your application already has its genes:

```ts
import * as THREE from 'three';
import { createAxieMixer3D } from '@jaatster/threejs-axie-mixer3d-public';

const renderer = new THREE.WebGLRenderer({ antialias: true });
const mixer = await createAxieMixer3D({
  renderer,
  assetBaseUrl: '/assets/axie/',
});

const axie = await mixer.createFromGenes({
  axieId: 'example',
  genes: '<genes-from-your-server>',
  quality: 'balanced',
  artMode: 'faithful',
  strict: true,
});

scene.add(axie.wrapper);
axie.setMoveSpeed(0);

function frame(deltaSeconds: number) {
  axie.update(deltaSeconds);
  renderer.render(scene, camera);
}

axie.dispose();
mixer.dispose();
```

If your app resolves Axies by ID, keep that lookup on a server you control and
inject `createHttpAxieResolver({ endpoint: '/your/route/{id}' })` into the
mixer. Never put `SKY_MAVIS_API_KEY` in browser code or a `VITE_*` variable.

## Package surfaces

- package root: descriptors, genes, resolver, planning, mixer, lifecycle, and
  asset-location APIs
- `/three`: Three.js assembly, animation, weapons, and eye runtime
- `/rendering`: material adapters and render passes
- `/creator`: creator state and URL codec without DOM coupling
- `/creator/dom`: optional creator and animation-panel UI
- `/compat`: compatibility facades
- `/styles.css`: optional creator and animation-panel styles

Three.js stays a peer dependency so an application owns one Three.js instance.

## Runtime content

`public/assets/axie/` contains the asset manifest and the files it references.
`content-integrity.json` records every included path, byte size, and SHA-256.

To copy the pack into another project:

```sh
npm run copy-assets -- /path/to/app/public/assets/axie
```

Do not rename individual content files or edit the manifest by hand. Verify a
copy with:

```sh
npm run test:content
```

## Current limitations

- The API and asset schema are alpha and may change before a stable release.
- The content pack is large, so production games should choose an appropriate
  hosting and caching strategy rather than loading every file up front.
- Asset assembly is strict. Missing or unsupported source rows fail visibly
  instead of falling back to a different Axie part.
- Exact visual parity still depends on the target renderer, lighting, color
  management, device GPU, and quality settings.
- This repository does not provide hosting, account authentication, analytics,
  payments, or a production API proxy.

## Security and privacy

- Keep API keys and credentials on the server.
- Serve the content pack from a controlled origin and preserve its integrity
  receipt.
- Treat custom manifests, URLs, and fetchers as untrusted inputs.
- Apply response-size limits and an origin allowlist if you load remote assets.
- Dispose characters and mixers when no longer needed to release GPU memory.
- The demo includes no analytics or telemetry.

See [SECURITY.md](./SECURITY.md) for reporting and trust boundaries.

## Dependencies and rights

Runtime code depends on [Three.js](https://github.com/mrdoob/three.js), which is
distributed under its own MIT license. Build and test dependencies are listed
in `package.json` and retain their own licenses.

The public [Axie Mixer for Unity](https://github.com/axieinfinity/mixer-unity)
is a related official integration reference. It is not a license for this
repository, and this repository does not include its Spine runtime dependency.

Axie names, artwork, models, textures, animations, shaders, and related content
remain subject to [RIGHTS.md](./RIGHTS.md) and any applicable third-party terms.
Public availability does not grant rights beyond those terms.

## Contributions and support

Open an issue for a reproducible toolkit bug or documentation correction once
the repository is published. Include the browser, GPU, exact revision, Axie
input method, and a minimal reproduction. Do not include API keys, unpublished
assets, personal data, or private project material.

This public alpha has no uptime or response-time guarantee. Product-specific
game design, deployment, account, and competition support remain outside the
toolkit repository.
