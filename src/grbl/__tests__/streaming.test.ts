import { describe, expect, it } from 'vitest';
import { GrblController } from '../GrblController';
import { FakeTransport, tick } from './fakeTransport';
import { PEN_CHANGE_PREFIX } from '../program';

describe('character-counting streaming window', () => {
  it('sends only as many lines as fit in the 128-byte RX buffer', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);

    // Each line "G1X000" is 6 chars + '\n' = 7 bytes. floor(128 / 7) = 18 fit.
    const lines = Array.from({ length: 50 }, (_, i) => `G1X${String(i).padStart(3, '0')}`);
    c.streamProgram(lines);
    await tick();

    expect(t.lineWrites.length).toBe(18);
    expect(7 * 18).toBeLessThanOrEqual(128);
    expect(7 * 19).toBeGreaterThan(128);
  });

  it('releases the window as acks arrive', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    const lines = Array.from({ length: 50 }, (_, i) => `G1X${String(i).padStart(3, '0')}`);
    c.streamProgram(lines);
    await tick();
    expect(t.lineWrites.length).toBe(18);

    t.feed('ok\r\n'); // frees the oldest 7 bytes
    await tick();
    expect(t.lineWrites.length).toBe(19);
  });
});

describe('wcoKnown (gates position persistence)', () => {
  it('stays false until a status with a real WCO arrives', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    expect(c.wcoKnown).toBe(false);

    // A status without a WCO field must NOT mark the offset as known — the
    // cached WCO is still a guess, so a reconstructed work position is unsafe.
    t.feed('<Idle|MPos:100.000,100.000,0.000|FS:0,0>\r\n');
    await tick();
    expect(c.wcoKnown).toBe(false);

    t.feed('<Idle|MPos:100.000,100.000,0.000|WCO:100.000,100.000,0.000>\r\n');
    await tick();
    expect(c.wcoKnown).toBe(true);
  });
});

describe('completion detection', () => {
  it('completes only after queue empty AND state Idle', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    let complete = false;
    c.on('streamComplete', () => {
      complete = true;
    });

    c.streamProgram(['G1X1', 'G1X2']);
    await tick();
    t.feed('ok\r\n');
    t.feed('ok\r\n'); // all lines acked...
    await tick();
    expect(complete).toBe(false); // ...but no Idle yet

    t.feed('<Idle|MPos:0.000,0.000,0.000|FS:0,0>\r\n');
    await tick();
    expect(complete).toBe(true);
  });
});

describe('abort on error', () => {
  it('stops the stream and surfaces the offending line', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    let erroredLine = '';
    let abortReason = '';
    c.on('error', (e) => {
      erroredLine = e.line;
    });
    c.on('streamAborted', (e) => {
      abortReason = e.reason;
    });

    c.streamProgram(['G1X1', 'BADCMD', 'G1X3']);
    await tick();
    t.feed('ok\r\n'); // first line ok
    t.feed('error:20\r\n'); // second line rejected
    await tick();

    expect(erroredLine).toBe('BADCMD');
    expect(abortReason).toContain('error:20');
  });
});

describe('one program at a time', () => {
  it('refuses a second program while the first is in flight, leaving the first intact', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    c.streamProgram(['G1 X1', 'G1 X2', 'G1 X3']);
    await tick();
    const sent = t.lineWrites.length;
    expect(c.isStreaming).toBe(true);

    expect(() => c.streamProgram(['G1 X9'])).toThrow(/already running/);
    await tick();
    expect(t.lineWrites.length).toBe(sent); // nothing from the refused program went out
    expect(t.lineWrites.some((l) => l.includes('X9'))).toBe(false);
  });

  it('accepts a new program once the previous one completed', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    c.streamProgram(['G1 X1']);
    await tick();
    t.feed('ok\r\n');
    await tick();
    t.feed('<Idle|MPos:1.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>\r\n');
    await tick();
    expect(c.isStreaming).toBe(false);
    expect(() => c.streamProgram(['G1 X2'])).not.toThrow();
  });
});

describe('pen-change holds', () => {
  /** Ack `n` lines and let the controller's write chain settle. */
  async function ack(t: FakeTransport, n: number) {
    for (let i = 0; i < n; i++) {
      t.feed('ok\r\n');
      await tick();
    }
  }
  const idle = '<Idle|MPos:0.000,0.000,0.000|WCO:0.000,0.000,0.000>\r\n';
  const run = '<Run|MPos:5.000,0.000,0.000|WCO:0.000,0.000,0.000>\r\n';

  const program = (marker = `${PEN_CHANGE_PREFIX}Red 0.5`) => [
    'G21',
    'G90',
    marker,
    'G1 X1 Y1 F100',
    'G1 X2 Y2 F100',
  ];

  it('stops feeding at the marker and prompts once the machine is idle', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    const prompts: { index: number; label: string }[] = [];
    c.on('penChange', (e) => prompts.push(e));

    c.streamProgram(program());
    await tick();
    // Only the first segment is ever queued: the lines after the marker are not
    // sent, so the machine cannot draw them with the wrong pen in the holder.
    expect(t.lineWrites).toEqual(['G21\n', 'G90\n']);

    // Still moving when the last ack lands — the prompt must wait.
    t.feed(run);
    await ack(t, 2);
    expect(prompts).toHaveLength(0);

    t.feed(idle);
    await tick();
    expect(prompts).toEqual([{ index: 0, label: 'Red 0.5' }]);
    expect(c.penChange).toEqual({ index: 0, label: 'Red 0.5' });
    expect(t.lineWrites).toEqual(['G21\n', 'G90\n']);
  });

  it('sends the next segment only on continueProgram', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    c.streamProgram(program());
    await tick();
    t.feed(idle);
    await ack(t, 2);
    await tick();
    expect(c.penChange).not.toBeNull();

    c.continueProgram();
    await tick();
    expect(t.lineWrites).toEqual(['G21\n', 'G90\n', 'G1 X1 Y1 F100\n', 'G1 X2 Y2 F100\n']);
    expect(c.penChange).toBeNull();
  });

  it('ignores a stray continue, so a second client cannot skip a segment', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    c.streamProgram(program());
    await tick();
    c.continueProgram(); // no pen change pending yet
    await tick();
    expect(t.lineWrites).toEqual(['G21\n', 'G90\n']);
  });

  it('does not let Resume pump past a held pen change', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    c.streamProgram(program());
    await tick();
    t.feed(idle);
    await ack(t, 2);
    await tick();

    c.pause();
    c.resume(); // a pause/resume round trip must not release the pen hold
    await tick();
    expect(t.lineWrites).toEqual(['G21\n', 'G90\n']);
    expect(c.penChange).not.toBeNull();
  });

  it('counts progress across the whole job and completes at the end', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    const progress: { acked: number; total: number }[] = [];
    let complete = false;
    c.on('streamProgress', (p) => progress.push(p));
    c.on('streamComplete', () => {
      complete = true;
    });

    c.streamProgram(program());
    await tick();
    t.feed(idle);
    await ack(t, 2);
    await tick();
    // The marker is not a machine line, so the total is the 4 real lines.
    expect(progress[progress.length - 1]).toEqual({ acked: 2, total: 4 });

    c.continueProgram();
    await tick();
    await ack(t, 2);
    t.feed(idle);
    await tick();
    expect(progress[progress.length - 1]).toEqual({ acked: 4, total: 4 });
    expect(complete).toBe(true);
  });

  it('still counts as streaming while held, so a second plot is refused', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    c.streamProgram(program());
    await tick();
    t.feed(idle);
    await ack(t, 2);
    await tick();
    expect(c.isStreaming).toBe(true);
    expect(() => c.streamProgram(['G1 X9 Y9 F100'])).toThrow(/already running/);
  });

  it('skips an empty segment rather than prompting for a pen that draws nothing', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    const prompts: { index: number; label: string }[] = [];
    c.on('penChange', (e) => prompts.push(e));
    c.streamProgram([
      'G21',
      `${PEN_CHANGE_PREFIX}Red`,
      `${PEN_CHANGE_PREFIX}Blue`,
      'G1 X1 Y1 F100',
    ]);
    await tick();
    t.feed(idle);
    await ack(t, 1);
    await tick();
    expect(prompts).toHaveLength(1);
    c.continueProgram();
    await tick();
    // Continuing from the first prompt skips the empty middle segment and sends
    // the last one — the operator is asked once, not twice.
    expect(t.lineWrites).toEqual(['G21\n', 'G1 X1 Y1 F100\n']);
  });
});
