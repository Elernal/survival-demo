# 3D character source — CC0

## Survivor.glb

This game uses the **Sam** adult character and its original in-place brisk walk
animation from Innerscene, adapted from MakeHuman/MPFB CC0 assets.

Primary source page:
https://www.innerscene.com/tools/library/3d-parts/brisk-walk-sam-3d-person-animated-bed03fa4

The source page identifies the character, skin, rig and authored motion as CC0.
The downloaded GLB also embeds this copyright notice in `asset.copyright`:

> Authored by Innerscene Corp (innerscene.com). Public domain: dedicated under CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/. Free to use, modify and redistribute for any purpose, with no credit required.

License: https://creativecommons.org/publicdomain/zero/1.0/

### Local transformation

Original self-contained GLB: 21,013,464 bytes. Browser version: 5,650,620 bytes.
Embedded textures were resized to at most 512 px (body color at most 1024 px),
then recompressed as PNG or JPEG according to transparency and texture type.
Geometry, skin weights, bones and animation payloads were preserved. The derived
GLB retains the source CC0 copyright notice. No Mixamo assets are shipped here.

The character uses an olive/sage top, charcoal/navy trousers and leather shoes.
It is a reusable prototype actor, not the game's final custom survivor/infected
model. It has 91,610 triangles across the source meshes and a `Walk_Brisk` clip
lasting approximately 1.733 seconds. The source small held-accessory mesh can be
hidden when equipping the game's own weapon geometry.

See `Survivor-source.json` for recorded source metadata and file hashes.

## Rendering libraries

Three.js r170 (version 0.170.0), GLTFLoader, SkeletonUtils and
BufferGeometryUtils are vendored in `../vendor/`. Their MIT license is retained
at `../vendor/LICENSE-three.txt`. Bare `three` imports and the loader utility
import were rewritten to sibling relative URLs; library behavior was unchanged.
