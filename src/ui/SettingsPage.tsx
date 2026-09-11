import type { Calibration } from '../grbl/settings';
import type { GrblSettings } from '../grbl/types';
import { btn, btnPrimary, field } from './styles';

/** Labels for the GRBL settings worth naming in the read-only `$$` view. */
const GRBL_LABELS: Record<number, string> = {
  11: 'junction deviation (mm)',
  20: 'soft limits',
  22: 'homing cycle',
  100: 'X steps/mm',
  101: 'Y steps/mm',
  102: 'Z steps/mm',
  110: 'X max rate (mm/min)',
  111: 'Y max rate (mm/min)',
  112: 'Z max rate (mm/min)',
  120: 'X acceleration (mm/s²)',
  121: 'Y acceleration (mm/s²)',
  122: 'Z acceleration (mm/s²)',
  130: 'X max travel (mm)',
  131: 'Y max travel (mm)',
  132: 'Z max travel (mm)',
};

export interface SettingsPageProps {
  /** Machine setup being edited. Changes apply live — there is no Save button. */
  cal: Calibration;
  onCalField: (key: keyof Calibration) => (value: number) => void;
  /** The controller's own `$$` settings, shown read-only. */
  grbl: GrblSettings;
  connected: boolean;
  firmwareVersion: string;
  appVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  /** A plot is streaming: an update is refused (the daemon refuses it too). */
  plotting: boolean;
  onUpdate: () => void;
  onClose: () => void;
}

/**
 * The settings page: everything configured once and then left alone, moved off
 * the main page so that page is only the job (artwork, canvas, jog, plot).
 *
 * Edits apply immediately — the values are the shared app settings, so a change
 * here is on the gateway and on every other client before the page is closed.
 * There is deliberately no Save/Cancel: a half-applied machine setup is worse
 * than an immediate one, since the feeds and pen Z are read when a plot starts.
 */
export function SettingsPage(p: SettingsPageProps) {
  const grblNums = Object.keys(p.grbl)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/40 p-0 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none bg-white shadow-xl md:mx-auto md:max-w-3xl md:rounded-lg">
        <header className="flex items-center gap-2 border-b border-slate-300 px-4 py-2">
          <h2 className="text-sm font-semibold">Settings</h2>
          <span className="text-xs text-slate-500">
            applied immediately, and shared with every device on this plotter
          </span>
          <button className={`${btnPrimary} ml-auto`} onClick={p.onClose}>
            Done
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm md:grid md:grid-cols-2 md:gap-x-8">
          <Group title="Machine">
            <p className="mb-1.5 text-xs text-slate-500">
              The work area the artwork must fit inside. The origin is the paper's top-left corner.
            </p>
            <NumberField
              label="Work area X (mm)"
              value={p.cal.workAreaX}
              step={1}
              onChange={p.onCalField('workAreaX')}
            />
            <NumberField
              label="Work area Y (mm)"
              value={p.cal.workAreaY}
              step={1}
              onChange={p.onCalField('workAreaY')}
            />
          </Group>

          <Group title="Pen">
            <p className="mb-1.5 text-xs text-slate-500">
              This machine has an <b>inverted Z</b>: Z+ moves the pen <b>down</b>. Pen-down Z is
              positive; pen-up is 0 or below.
            </p>
            <NumberField
              label="Pen-down Z"
              value={p.cal.penDownZ}
              step={0.1}
              onChange={p.onCalField('penDownZ')}
            />
            <NumberField
              label="Pen-up Z"
              value={p.cal.penUpZ}
              step={0.1}
              onChange={p.onCalField('penUpZ')}
            />
            <NumberField
              label="Dwell (ms)"
              value={p.cal.penDwellMs}
              step={10}
              onChange={p.onCalField('penDwellMs')}
            />
          </Group>

          <Group title="Feeds">
            <p className="mb-1.5 text-xs text-slate-500">
              Feed rates in mm/min. Draw and travel are baked into a plot's G-code when it starts;
              jog applies to the arrow buttons.
            </p>
            <NumberField
              label="Draw feed"
              value={p.cal.drawFeed}
              step={100}
              onChange={p.onCalField('drawFeed')}
            />
            <NumberField
              label="Travel feed"
              value={p.cal.travelFeed}
              step={100}
              onChange={p.onCalField('travelFeed')}
            />
            <NumberField
              label="Jog feed"
              value={p.cal.jogFeed}
              step={100}
              onChange={p.onCalField('jogFeed')}
            />
          </Group>

          <Group title="Import defaults">
            <p className="mb-1.5 text-xs text-slate-500">
              Where a newly imported image starts. Each artwork keeps its own values afterwards —
              retune those in Drawing controls on the main page.
            </p>
            <NumberField
              label="PNG threshold"
              value={p.cal.pngThreshold}
              step={0.05}
              onChange={p.onCalField('pngThreshold')}
            />
            <NumberField
              label="PNG levels"
              value={p.cal.pngLevels}
              step={1}
              onChange={p.onCalField('pngLevels')}
            />
          </Group>

          <Group title="Connection">
            <dl className="text-xs text-slate-600">
              <Row label="Plotter" value={p.connected ? 'connected' : 'not connected'} />
              <Row label="GRBL firmware" value={p.connected ? p.firmwareVersion : '—'} />
              <Row label="App version" value={p.appVersion || '—'} />
              <Row label="Latest release" value={p.latestVersion ?? 'unknown'} />
            </dl>
            {p.updateAvailable && (
              <button
                className={`${btnPrimary} mt-2`}
                disabled={!p.connected || p.plotting}
                title={p.plotting ? 'Disabled while a plot is running' : undefined}
                onClick={p.onUpdate}
              >
                Update to v{p.latestVersion}
              </button>
            )}
          </Group>

          <Group title="Controller settings ($$)">
            <p className="mb-1.5 text-xs text-slate-500">
              The controller's own settings, as it reports them. Read-only here — changing these
              writes the machine's EEPROM, which belongs in a terminal, not a click.
            </p>
            {grblNums.length === 0 ? (
              <p className="text-xs text-slate-500">
                {p.connected ? 'No settings reported yet.' : 'Connect to read them.'}
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto font-mono text-[11px] text-slate-600">
                {grblNums.map((n) => (
                  <li key={n} className="flex justify-between gap-2">
                    <span>
                      ${n}
                      {GRBL_LABELS[n] ? (
                        <span className="ml-1 font-sans text-slate-400">{GRBL_LABELS[n]}</span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{p.grbl[n]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Group>
        </div>

        <footer className="flex justify-end border-t border-slate-300 px-4 py-2">
          <button className={btn} onClick={p.onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Group(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{props.label}</dt>
      <dd className="tabular-nums">{props.value}</dd>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs text-slate-600">{props.label}</span>
      <input
        type="number"
        className={`${field} w-24`}
        value={props.value}
        step={props.step ?? 1}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
