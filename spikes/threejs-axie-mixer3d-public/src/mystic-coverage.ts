import { AXIE_ADDON_SOURCE_CATALOG } from './addon-source-catalog.generated';
import { ADDON_SUPPORTED_PARTICLE_MODULES } from './addon-particle-runtime';
import { MYSTIC_SHADER_DEFINITIONS } from './mystic-shader-registry';
import { AXIE_MYSTIC_SOURCE_CATALOG } from './mystic-source-catalog.generated';
import type {
  AddonSourceCatalog,
  MysticDiagnostic,
  MysticSourceCatalog,
} from './mystic-types';

export const AXIE_MYSTIC_EXPECTED_COVERAGE = Object.freeze({
  shaders: 10,
  materials: 50,
  prefabs: 47,
  particles: 85,
});

export interface MysticCoverageCounts {
  readonly shaders: number;
  readonly materials: number;
  readonly prefabs: number;
  readonly particles: number;
}

export interface MysticCoverageReport {
  readonly sourceCommit: string;
  readonly counts: MysticCoverageCounts;
  readonly expected: MysticCoverageCounts;
  readonly diagnostics: readonly MysticDiagnostic[];
  readonly complete: boolean;
}

function duplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  values.forEach((value) => (seen.has(value) ? duplicate.add(value) : seen.add(value)));
  return [...duplicate];
}

export function validateMysticAddonCoverage(
  mystic: MysticSourceCatalog = AXIE_MYSTIC_SOURCE_CATALOG,
  addons: AddonSourceCatalog = AXIE_ADDON_SOURCE_CATALOG,
): MysticCoverageReport {
  const diagnostics: MysticDiagnostic[] = [];
  const fail = (message: string, assetId?: string) => diagnostics.push({
    severity: 'error',
    code: 'mystic-catalog-invalid',
    message,
    assetId,
  });
  const particles = addons.prefabs.flatMap((prefab) => prefab.particles);
  const counts = {
    shaders: mystic.shaders.length,
    materials: mystic.materials.length,
    prefabs: addons.prefabs.length,
    particles: particles.length,
  };
  for (const key of Object.keys(AXIE_MYSTIC_EXPECTED_COVERAGE) as (
    keyof typeof AXIE_MYSTIC_EXPECTED_COVERAGE
  )[]) {
    if (counts[key] !== AXIE_MYSTIC_EXPECTED_COVERAGE[key]) {
      fail(`${key} coverage is ${counts[key]}; expected ${AXIE_MYSTIC_EXPECTED_COVERAGE[key]}.`);
    }
  }
  if (mystic.sourceCommit !== addons.sourceCommit) {
    fail(`Mystic and add-on catalogs use different commits: ${mystic.sourceCommit} vs ${addons.sourceCommit}.`);
  }

  const shaderIds = new Set(mystic.shaders.map((shader) => shader.guid));
  mystic.shaders.forEach((shader) => {
    const runtime = MYSTIC_SHADER_DEFINITIONS.get(shader.guid);
    if (!runtime) fail(`Shader ${shader.name} has no Three.js factory.`, shader.guid);
    else if (runtime.sourceName !== shader.name) {
      fail(`Shader name mismatch for ${shader.guid}: ${runtime.sourceName} vs ${shader.name}.`, shader.guid);
    }
  });
  MYSTIC_SHADER_DEFINITIONS.forEach((definition, guid) => {
    if (!shaderIds.has(guid)) fail(`Runtime shader ${definition.sourceName} is absent from source catalog.`, guid);
  });

  const materialIds = new Set(mystic.materials.map((material) => material.id));
  mystic.materials.forEach((material) => {
    if (!MYSTIC_SHADER_DEFINITIONS.has(material.shaderGuid)) {
      fail(`Material ${material.id} has no shader factory for ${material.shaderGuid}.`, material.id);
    }
  });
  duplicates(mystic.materials.map((material) => material.id)).forEach((id) => {
    fail(`Duplicate material id ${id}.`, id);
  });
  duplicates(addons.prefabs.map((prefab) => prefab.id)).forEach((id) => {
    fail(`Duplicate prefab id ${id}.`, id);
  });
  duplicates(particles.map((particle) => particle.id)).forEach((id) => {
    fail(`Duplicate particle id ${id}.`, id);
  });

  addons.prefabs.forEach((prefab) => {
    const objectsWithTransforms = new Set(prefab.transforms.map((transform) => transform.gameObjectId));
    const transformIds = new Set(prefab.transforms.map((transform) => transform.fileId));
    prefab.transforms.forEach((transform) => {
      if (transform.parentFileId !== '0' && !transformIds.has(transform.parentFileId)) {
        fail(`Transform ${transform.fileId} has unresolved parent ${transform.parentFileId}.`, prefab.id);
      }
    });
    prefab.particles.forEach((particle) => {
      if (!objectsWithTransforms.has(particle.gameObjectId)) {
        fail(`Particle ${particle.id} has no GameObject transform.`, particle.id);
      }
      particle.renderer.materialIds.forEach((materialId) => {
        if (!materialIds.has(materialId)) {
          fail(`Particle ${particle.id} references unresolved material ${materialId}.`, particle.id);
        }
      });
      particle.enabledModules.forEach((module) => {
        if (!ADDON_SUPPORTED_PARTICLE_MODULES.has(module)) {
          fail(`Particle ${particle.id} enables unsupported module ${module}.`, particle.id);
        }
      });
      if (particle.renderer.renderMode !== 0) {
        fail(`Particle ${particle.id} uses unsupported renderer mode ${particle.renderer.renderMode}.`, particle.id);
      }
      if (particle.shape.enabled && particle.shape.type !== 0) {
        fail(`Particle ${particle.id} uses unsupported shape ${particle.shape.type}.`, particle.id);
      }
    });
  });

  return {
    sourceCommit: mystic.sourceCommit,
    counts,
    expected: AXIE_MYSTIC_EXPECTED_COVERAGE,
    diagnostics,
    complete: diagnostics.length === 0,
  };
}

export function assertMysticAddonCoverage(
  mystic: MysticSourceCatalog = AXIE_MYSTIC_SOURCE_CATALOG,
  addons: AddonSourceCatalog = AXIE_ADDON_SOURCE_CATALOG,
) {
  const report = validateMysticAddonCoverage(mystic, addons);
  if (!report.complete) {
    throw new Error(report.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
  return report;
}
