'use client';

import { ChangeEvent } from 'react';

/**
 * Field names mirror `src/lib/ai/plan-option-tree-config.json`. Do not rename
 * without coordinating a config migration.
 */
export interface OptionTreeLevel {
  question: string;
  breadcrumbLabel?: string;
  options?: string[];
  multiSelect?: boolean;
  dependsOn?: Record<string, string[]>;
  freeText: boolean;
  freeTextPlaceholder?: string;
}

export interface OptionTreeLevelSelection {
  options: string[];
  freeText: string;
}

/** levelIndex (0-based) → selection. Mirrors `GuidedSelections[categoryKey]`. */
export type OptionTreeSelections = Record<number, OptionTreeLevelSelection>;

export interface OptionTreeProps {
  levels: OptionTreeLevel[];
  selections: OptionTreeSelections;
  onChange: (next: OptionTreeSelections) => void;
  disabled?: boolean;
}

interface OptionGroup {
  label: string | null;
  options: string[];
}

/**
 * Resolve the visible options for a level, grouped by the parent-level
 * selection that produced them.
 *
 * Cascade rule: when `dependsOn` is set, the parent is always level index 0
 * (matches every shipped category in plan-option-tree-config.json). If the
 * parent has no selections, fall back to the level's static `options` list
 * (typically empty for dependsOn levels — caller may still render free text).
 */
function resolveOptionGroups(
  level: OptionTreeLevel,
  selections: OptionTreeSelections
): OptionGroup[] {
  const fallback = level.options ?? [];
  if (!level.dependsOn) return [{ label: null, options: fallback }];

  const parentSelections = selections[0]?.options ?? [];
  if (parentSelections.length === 0) return [{ label: null, options: fallback }];

  const seen = new Set<string>();
  const groups: OptionGroup[] = [];
  for (const parentOption of parentSelections) {
    const mapped = level.dependsOn[parentOption];
    if (!mapped) continue;
    const deduped: string[] = [];
    for (const opt of mapped) {
      if (!seen.has(opt)) {
        seen.add(opt);
        deduped.push(opt);
      }
    }
    if (deduped.length > 0) groups.push({ label: parentOption, options: deduped });
  }

  return groups.length > 0 ? groups : [{ label: null, options: fallback }];
}

function readLevel(selections: OptionTreeSelections, levelIndex: number): OptionTreeLevelSelection {
  return selections[levelIndex] ?? { options: [], freeText: '' };
}

/**
 * Reusable, fully-controlled option-tree renderer for one category. Stacks
 * every level vertically with cascading visibility — designed to slot into an
 * accordion panel (one panel per category).
 *
 * The wizard-style level-by-level navigation used by GuidedPlanBuilder is NOT
 * provided here; consumers that want it should compose their own navigation
 * around per-level state.
 *
 * @example
 * ```tsx
 * import OptionTree, { OptionTreeSelections } from '@/components/shared/OptionTree';
 * import planConfig from '@/lib/ai/plan-option-tree-config.json';
 *
 * function MainsPicker() {
 *   const levels = planConfig.christmas.categories.mains.levels;
 *   const [selections, setSelections] = useState<OptionTreeSelections>({});
 *   return (
 *     <OptionTree levels={levels} selections={selections} onChange={setSelections} />
 *   );
 * }
 * ```
 */
export default function OptionTree({
  levels,
  selections,
  onChange,
  disabled = false,
}: OptionTreeProps) {
  function toggleOption(levelIndex: number, option: string, multiSelect: boolean) {
    const lvlSel = readLevel(selections, levelIndex);
    const alreadySelected = lvlSel.options.includes(option);

    let nextOptions: string[];
    if (multiSelect) {
      nextOptions = alreadySelected
        ? lvlSel.options.filter((o) => o !== option)
        : [...lvlSel.options, option];
    } else {
      nextOptions = alreadySelected ? [] : [option];
    }

    onChange({
      ...selections,
      [levelIndex]: { ...lvlSel, options: nextOptions },
    });
  }

  function setFreeText(levelIndex: number, text: string) {
    const lvlSel = readLevel(selections, levelIndex);
    onChange({
      ...selections,
      [levelIndex]: { ...lvlSel, freeText: text },
    });
  }

  return (
    <div className="space-y-5">
      {levels.map((level, levelIndex) => {
        const lvlSel = readLevel(selections, levelIndex);
        const groups = resolveOptionGroups(level, selections);
        const hasAnyOptions = groups.some((g) => g.options.length > 0);
        const showSectionLabels = groups.length > 1 && groups[0].label !== null;
        const multiSelect = level.multiSelect !== false;
        const inputType = multiSelect ? 'checkbox' : 'radio';
        const radioName = `option-tree-level-${levelIndex}`;

        return (
          <div key={levelIndex}>
            <p className="text-sm text-gray-700 font-medium mb-2">{level.question}</p>

            {hasAnyOptions && (
              <div className="space-y-1 mb-2">
                {groups.map((group, gi) => (
                  <div key={group.label ?? `group-${gi}`}>
                    {showSectionLabels && group.label && (
                      <>
                        {gi > 0 && <div className="border-t border-gray-100 my-2" />}
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 pt-1 pb-1">
                          {group.label}
                        </p>
                      </>
                    )}
                    {group.options.map((option) => {
                      const selected = lvlSel.options.includes(option);
                      return (
                        <label
                          key={option}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border transition-colors ${
                            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                          } ${
                            selected
                              ? 'bg-accent/10 border-accent'
                              : 'bg-white border-gray-200 hover:border-accent hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type={inputType}
                            name={multiSelect ? undefined : radioName}
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleOption(levelIndex, option, multiSelect)}
                            className="w-4 h-4 border-gray-300 text-accent focus:ring-accent shrink-0"
                          />
                          <span
                            className={`text-sm ${
                              selected ? 'text-gray-900 font-medium' : 'text-gray-700'
                            }`}
                          >
                            {option}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {level.freeText && (
              <textarea
                value={lvlSel.freeText}
                disabled={disabled}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setFreeText(levelIndex, e.target.value)
                }
                placeholder={level.freeTextPlaceholder}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
