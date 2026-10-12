import { BaseSequencer, type TestSpecification } from 'vitest/node'

/** Stable order key: project name first, then file path. Pure, so a unit test can pin it. */
export function sortSpecsByPath<T extends { moduleId: string; project: { name: string } }>(specs: readonly T[]): T[] {
  return [...specs].sort((a, b) => {
    if (a.project.name !== b.project.name) return a.project.name < b.project.name ? -1 : 1
    return a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0
  })
}

/**
 * Deterministic file order. vitest's default sequencer orders by the cached result of the previous
 * run (failed files first, then the longest), so one failure reshuffled the next run and made the
 * victim of leftover state look random. Sorting by path means a failure is replayable. An explicit
 * `--sequence.shuffle` still shuffles files (that is how order dependence is audited).
 */
export default class PathSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const shuffle = this.ctx.config.sequence.shuffle as boolean | { files?: boolean } | undefined
    if (typeof shuffle === 'object' ? shuffle.files : shuffle) return super.sort(files)
    return sortSpecsByPath(files)
  }
}
