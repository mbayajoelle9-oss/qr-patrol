import type { PatrolOccurrence, Schedule } from './types';

/**
 * Masque ce qui ne doit plus apparaître : les rondes dont la ronde a été supprimée, et celles dont le planning
 * a été retiré quand rien ne s'est passé dessus (aucun point scanné, aucun incident).
 */
export function visibleOccurrences(items: PatrolOccurrence[], schedules: Schedule[] | null): PatrolOccurrence[] {
  const active = schedules ? new Set(schedules.filter((s) => s.active).map((s) => s.id)) : null;
  return items.filter((it) => {
    if (!it.route) return false;
    if (!active || !it.schedule) return true;
    if (active.has(it.schedule)) return true;
    return it.stats.done > 0 || it.stats.incidents > 0;
  });
}
