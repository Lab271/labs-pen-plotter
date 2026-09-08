/** Jog step presets, mm — the 3D-printer convention operators already know. */
export const JOG_STEPS = [0.1, 1, 5, 10] as const;

/**
 * Step-size button group. Fixed presets rather than a free number: sighting a
 * pen tip onto a crosshair is 10 → 1 → 0.1 mm in turn, and a button per size
 * beats retyping a field while watching the tip.
 */
export function StepPicker(props: { value: number; onChange: (mm: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="mr-1 text-slate-600">Step</span>
      {JOG_STEPS.map((s) => (
        <button
          key={s}
          className={`rounded border px-2 py-1 ${
            props.value === s
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-300 bg-white hover:bg-slate-50'
          }`}
          onClick={() => props.onChange(s)}
          aria-pressed={props.value === s}
        >
          {s}
        </button>
      ))}
      <span className="text-slate-500">mm</span>
    </div>
  );
}
