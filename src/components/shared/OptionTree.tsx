'use client';

import { ChangeEvent, useId } from 'react';
import { withoutOrphanedChoices } from '@/lib/ai/config-loader';

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

function readLevel(selections: OptionTreeSelections, levelIndex: number): OptionTreeLevelSelection {
  return selections[levelIndex] ?? { options: [], freeText: '' };
}

/**
 * Reusable, fully-controlled option-tree renderer for one category — designed to
 * slot into an accordion panel (one panel per category).
 *
 * GTC-364 (item 24, W8; Q4, Q5): a level that depends on the first (`dependsOn`;
 * every shipped category's second level) opens right under each ticked option of
 * the first — its own question, then that option's choices — and its one "Other"
 * box sits at the bottom of them, under the last ticked option. A choice listed
 * under two ticked options shows once, under the first. A level that depends on
 * nothing (Alcoholic Drinks' "Anything else to consider?") follows, as before.
 * Every change goes out through `withoutOrphanedChoices`, so unticking an option
 * unticks the choices only it listed. What is stored keeps its shape.
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
  // GTC-363 (item 20): ties each "Other" label to its box, unique per tree on the page.
  const idBase = useId();

  // GTC-364 (Q5): unticking an option unticks the choices only it listed.
  const emit = (next: OptionTreeSelections) => onChange(withoutOrphanedChoices(levels, next));

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

    emit({
      ...selections,
      [levelIndex]: { ...lvlSel, options: nextOptions },
    });
  }

  function setFreeText(levelIndex: number, text: string) {
    const lvlSel = readLevel(selections, levelIndex);
    emit({
      ...selections,
      [levelIndex]: { ...lvlSel, freeText: text },
    });
  }

  function renderOption(levelIndex: number, option: string) {
    const level = levels[levelIndex];
    const multiSelect = level.multiSelect !== false;
    const selected = readLevel(selections, levelIndex).options.includes(option);
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
          type={multiSelect ? 'checkbox' : 'radio'}
          name={multiSelect ? undefined : `option-tree-level-${levelIndex}`}
          checked={selected}
          disabled={disabled}
          onChange={() => toggleOption(levelIndex, option, multiSelect)}
          className="w-4 h-4 border-gray-300 text-accent focus:ring-accent shrink-0"
        />
        <span className={`text-sm ${selected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
          {option}
        </span>
      </label>
    );
  }

  // GTC-363 (item 20, W12): every type-your-own box reads as "Other". The placeholder
  // still comes from the config.
  function renderOther(levelIndex: number) {
    const level = levels[levelIndex];
    if (!level.freeText) return null;
    return (
      <>
        <label
          htmlFor={`${idBase}-other-${levelIndex}`}
          className="block text-xs font-medium text-gray-500 mb-1"
        >
          Other
        </label>
        <textarea
          id={`${idBase}-other-${levelIndex}`}
          value={readLevel(selections, levelIndex).freeText}
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setFreeText(levelIndex, e.target.value)
          }
          placeholder={level.freeTextPlaceholder}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </>
    );
  }

  const first = levels[0];
  if (!first) return null;
  const firstOptions = first.options ?? [];
  const ticked = firstOptions.filter((o) => readLevel(selections, 0).options.includes(o));
  const dependent = levels.flatMap((level, i) => (i > 0 && level.dependsOn ? [i] : []));
  const independent = levels.flatMap((level, i) => (i > 0 && !level.dependsOn ? [i] : []));

  // Each dependent level's choices under each ticked option, a choice shown once (under the
  // first ticked option listing it); and which ticked option carries the level's "Other" box.
  const nested = new Map<string, Map<number, string[]>>();
  const otherUnder = new Map<number, string>();
  for (const i of dependent) {
    const shown = new Set<string>();
    for (const option of ticked) {
      const mapped = levels[i].dependsOn?.[option];
      if (!mapped) continue;
      const own = mapped.filter((c) => !shown.has(c));
      own.forEach((c) => shown.add(c));
      if (!nested.has(option)) nested.set(option, new Map());
      nested.get(option)!.set(i, own);
      otherUnder.set(i, option);
    }
  }

  return (
    <div className="space-y-0">
      <div>
        <p className="text-sm text-gray-700 font-medium mb-2">{first.question}</p>
        {firstOptions.length > 0 && (
          <div className="space-y-1 mb-2">
            {firstOptions.map((option) => (
              <div key={option}>
                {renderOption(0, option)}
                {[...(nested.get(option)?.entries() ?? [])].map(([i, choices]) => (
                  <div
                    key={i}
                    className="ml-4 mt-2 mb-3 pl-4 border-l-2 border-l-gray-100 space-y-1"
                  >
                    {choices.length > 0 && (
                      <>
                        <p className="text-sm text-gray-700 font-medium mb-2">
                          {levels[i].question}
                        </p>
                        {choices.map((choice) => renderOption(i, choice))}
                      </>
                    )}
                    {otherUnder.get(i) === option && <div className="pt-1">{renderOther(i)}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {renderOther(0)}
      </div>

      {/* A dependent level with no ticked option to sit under shows only to keep typed text in
          view: its question and its "Other" box, after the first level. */}
      {dependent
        .filter((i) => !otherUnder.has(i) && readLevel(selections, i).freeText.trim() !== '')
        .map((i) => (
          <div
            key={i}
            className="mt-4 pt-4 pl-4 border-t border-gray-100 border-l-2 border-l-gray-100"
          >
            <p className="text-sm text-gray-700 font-medium mb-2">{levels[i].question}</p>
            {renderOther(i)}
          </div>
        ))}

      {independent.map((i) => {
        const level = levels[i];
        const options = level.options ?? [];
        return (
          <div
            key={i}
            className="mt-4 pt-4 pl-4 border-t border-gray-100 border-l-2 border-l-gray-100"
          >
            <p className="text-sm text-gray-700 font-medium mb-2">{level.question}</p>
            {options.length > 0 && (
              <div className="space-y-1 mb-2">{options.map((o) => renderOption(i, o))}</div>
            )}
            {renderOther(i)}
          </div>
        );
      })}
    </div>
  );
}
