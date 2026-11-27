/**
 * [[GTC-487]] — the plan view's sixteen named changes (28 Nov 2026), for the older suites that hold
 * `src/components/plan/Moment2PlanView.tsx` byte for byte: tweaks-b P6, tweaks-g P1 part 2 and
 * tweaks-h P4. The founder's word on its plan: "yes to all 13 moves as you describe them, each the
 * narrowest way with a dated note naming GTC-487".
 *
 * Each change is [was, is], in the order GTC-487 made them: B (a plan row reads "1 tray"), D (the
 * bar folds away: its words, its state, its measured room, its frame, the slim rows) and E (the
 * Regenerate bar for the whole plan and for one category). `withoutGtc487PlanView` takes them back,
 * last first, each `is` required exactly once, and returns the file as it was at 89da9a3, or a
 * sentence saying which change is missing, repeated or altered. Any other edit still shows.
 */
export const GTC487_PLAN_VIEW_CHANGES: [string, string][] = [
  [
    "} from '@/components/sessions/SessionTabs';\n",
    "} from '@/components/sessions/SessionTabs';\nimport { PlanWaitBar } from './Moment2Step2Skeleton';\nimport {\n  CATEGORY_WAIT_TAU_MS,\n  REGENERATE_WAIT_WORDS,\n  categoryWaitStage,\n  planWaitPercent,\n  planWaitStage,\n} from '@/lib/setup/plan-wait';\nimport { unitWordFor } from '@/lib/items/unit-words';\n",
  ],
  [
    '// ─── Constants ───────────────────────────────────────────────────────────────\n\n',
    "// ─── Constants ───────────────────────────────────────────────────────────────\n\n/** [[GTC-487]] D: the bar's fold words (the founder's ruling 6, 28 Nov 2026: W19, W20, W21, W23). */\nexport const PLAN_BAR_WORDS = {\n  LESS: 'Less ▾',\n  LESS_NAME: 'Show fewer buttons',\n  MORE: 'More ▴',\n  MORE_NAME: 'Show all the buttons',\n} as const;\n\n/** [[GTC-487]] D (ruling 4): where this device keeps her choice, one name for all her events. */\nexport const PLAN_BAR_FOLDED_KEY = 'gather.planBarFolded';\n\n",
  ],
  [
    '  const [bulkRemoving, setBulkRemoving] = useState(false);\n',
    "  const [bulkRemoving, setBulkRemoving] = useState(false);\n\n  /*\n    [[GTC-487]] D — the bar folds away when she taps (rulings 2 and 3), and stays as she left it on\n    this device (ruling 4: the browser's own storage, one name for all her events; nothing in the\n    database, nothing sent). It is drawn open first, as the server draws it, then read.\n  */\n  const [barFolded, setBarFolded] = useState(false);\n  useEffect(() => {\n    try {\n      if (window.localStorage.getItem(PLAN_BAR_FOLDED_KEY) === '1') setBarFolded(true);\n    } catch {\n      // A browser that keeps nothing starts open.\n    }\n  }, []);\n  const foldBar = (folded: boolean) => {\n    setBarFolded(folded);\n    try {\n      if (folded) window.localStorage.setItem(PLAN_BAR_FOLDED_KEY, '1');\n      else window.localStorage.removeItem(PLAN_BAR_FOLDED_KEY);\n    } catch {\n      // Not kept; it still folds for this visit.\n    }\n  };\n  // The room below the page follows the bar's real height, open or folded, so no control can sit\n  // behind it when the page is scrolled to its end (the GTC-364 shape).\n  const barRef = useRef<HTMLDivElement | null>(null);\n  const [barHeight, setBarHeight] = useState(0);\n  useEffect(() => {\n    const bar = barRef.current;\n    if (!bar || typeof ResizeObserver === 'undefined') return;\n    const measure = () => setBarHeight(bar.getBoundingClientRect().height);\n    measure();\n    const watch = new ResizeObserver(measure);\n    watch.observe(bar);\n    return () => watch.disconnect();\n  }, []);\n\n  // [[GTC-487]] E — Generate's clock while a Regenerate waits: the time since the press, never less\n  // than it was, so the bar cannot go back.\n  const [waitMs, setWaitMs] = useState(0);\n  useEffect(() => {\n    setWaitMs(0);\n    if (regeneratingScope === null) return;\n    const start = Date.now();\n    const timer = setInterval(() => {\n      setWaitMs((prev) => Math.max(prev, Date.now() - start));\n    }, 250);\n    return () => clearInterval(timer);\n  }, [regeneratingScope]);\n  // One category's bar, only in the category that is regenerating (ruling 5).\n  const categoryWait = (name: string) => {\n    const key = ownPlan ? null : (LABEL_TO_KEY[name] ?? null);\n    if (key === null || regeneratingScope !== key) return undefined;\n    return {\n      percent: planWaitPercent(waitMs, false, CATEGORY_WAIT_TAU_MS),\n      stage: categoryWaitStage(waitMs),\n      label: REGENERATE_WAIT_WORDS.category(name),\n    };\n  };\n",
  ],
  [
    "              : 'Not quite right? Regenerate the plan'}\n          </button>\n        )}\n",
    "              : 'Not quite right? Regenerate the plan'}\n          </button>\n        )}\n        {/* [[GTC-487]] E: Generate's bar under the button while the whole plan regenerates. */}\n        {regeneratingScope === 'plan' && (\n          <PlanWaitBar\n            percent={planWaitPercent(waitMs, false)}\n            stage={planWaitStage(waitMs)}\n            label={REGENERATE_WAIT_WORDS.PLAN}\n          />\n        )}\n",
  ],
  [
    '              onRegenerateCategory={onRegenerateCategory}\n',
    '              onRegenerateCategory={onRegenerateCategory}\n              wait={categoryWait(category.name)}\n',
  ],
  [
    '              + Add category\n            </button>\n          )}\n        </div>\n',
    '              + Add category\n            </button>\n          )}\n        </div>\n        {/* [[GTC-487]] D: room for the bar beyond the page\'s own 128 px, so the last control can\n            always sit above it, open or folded. */}\n        <div aria-hidden="true" style={{ height: Math.max(0, Math.ceil(barHeight) + 16 - 128) }} />\n',
  ],
  [
    '      {/* Sticky footer */}\n      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">\n',
    '      {/* Sticky footer */}\n      <div\n        ref={barRef}\n        data-plan-bar={barFolded ? \'folded\' : \'open\'}\n        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4"\n      >\n        {/* [[GTC-487]] D: the fold control, a slim row on top of the open bar (ruling 2, option 1). */}\n        {!barFolded && (\n          <div className="max-w-2xl mx-auto -mt-3 mb-1 flex justify-center">\n            <button\n              type="button"\n              data-plan-bar-less=""\n              onClick={() => foldBar(true)}\n              aria-label={PLAN_BAR_WORDS.LESS_NAME}\n              aria-expanded="true"\n              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-800"\n            >\n              {PLAN_BAR_WORDS.LESS}\n            </button>\n          </div>\n        )}\n',
  ],
  [
    '        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">\n',
    '        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">\n          {/* [[GTC-487]] D: folded, one slim row: More, and "Plan looks good" still in reach. */}\n          {barFolded && (\n            <button\n              type="button"\n              data-plan-bar-more=""\n              onClick={() => foldBar(false)}\n              aria-label={PLAN_BAR_WORDS.MORE_NAME}\n              aria-expanded="false"\n              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"\n            >\n              {PLAN_BAR_WORDS.MORE}\n            </button>\n          )}\n',
  ],
  [
    '            disabled={regeneratingScope !== null}\n            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"\n',
    "            disabled={regeneratingScope !== null}\n            className={`text-sm text-gray-600 hover:text-gray-900 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed${barFolded ? ' hidden' : ''}`}\n",
  ],
  [
    '            wants to do. */}\n        <div className="max-w-2xl mx-auto pt-2 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-center">\n',
    "            wants to do. */}\n        <div\n          className={`max-w-2xl mx-auto pt-2 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-center${barFolded ? ' hidden' : ''}`}\n        >\n",
  ],
  [
    "  regeneratingScope: 'plan' | string | null;\n  onRegenerateCategory: (categoryKey: string) => void;\n",
    "  regeneratingScope: 'plan' | string | null;\n  onRegenerateCategory: (categoryKey: string) => void;\n  /** [[GTC-487]] E: this category's own bar while it regenerates; absent otherwise. */\n  wait?: { percent: number; stage: string; label: string };\n",
  ],
  [
    '  regeneratingScope,\n  onRegenerateCategory,\n',
    '  regeneratingScope,\n  onRegenerateCategory,\n  wait,\n',
  ],
  [
    "    regeneratingScope === 'plan' || (categoryKey !== null && regeneratingScope === categoryKey);\n\n",
    "    regeneratingScope === 'plan' || (categoryKey !== null && regeneratingScope === categoryKey);\n\n  // [[GTC-487]] E: while its own bar shows, the section neither pulses nor greys (the bar would fade\n  // with it); its rows still cannot be tapped.\n  const regeneratingLook = wait\n    ? 'pointer-events-none'\n    : 'animate-pulse opacity-60 pointer-events-none';\n\n",
  ],
  [
    "  return (\n    <div className={isRegenerating ? 'animate-pulse opacity-60 pointer-events-none' : undefined}>\n",
    '  return (\n    <div className={isRegenerating ? regeneratingLook : undefined}>\n',
  ],
  [
    '                  </div>\n',
    '                  </div>\n                )}\n                {/* [[GTC-487]] E: Generate\'s bar under the button while this category regenerates. */}\n                {wait && (\n                  <PlanWaitBar\n                    percent={wait.percent}\n                    stage={wait.stage}\n                    label={wait.label}\n                    className="mt-1 mb-2"\n                  />\n',
  ],
  [
    '        >\n          {item.quantity} {item.unit}\n',
    '        >\n          {item.quantity} {unitWordFor(item.quantity, item.unit)}\n',
  ],
];

export function withoutGtc487PlanView(text: string): string {
  let out = text;
  for (let i = GTC487_PLAN_VIEW_CHANGES.length - 1; i >= 0; i--) {
    const [was, is] = GTC487_PLAN_VIEW_CHANGES[i];
    if (out.split(is).length !== 2)
      return `GTC-487's change ${i + 1} is missing, repeated or altered`;
    out = out.replace(is, () => was);
  }
  return out;
}
