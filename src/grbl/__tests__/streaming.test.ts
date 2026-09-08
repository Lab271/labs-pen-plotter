import { describe, expect, it } from 'vitest';
import { GrblController } from '../GrblController';
import { FakeTransport, tick } from './fakeTransport';

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

describe('shiftWorkZero (registration correction)', () => {
  const idle = '<Idle|MPos:10.000,20.000,0.000|FS:0,0|WCO:5.000,5.000,0.000>\r\n'; // wpos 5,15

  it('declares the current position to be wpos + (dx, dy), Z untouched', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    t.feed(idle);
    await tick();
    const done = c.shiftWorkZero(1, 0.5); // resolves on GRBL's ok
    await tick();
    expect(t.lineWrites).toContain('G10 L20 P1 X6 Y15.5\n');
    expect(t.lineWrites.some((l) => /G10.*Z/.test(l))).toBe(false);
    t.feed('ok\r\n');
    await done;
  });

  it('refuses when not idle, without a report, or while streaming', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    await expect(c.shiftWorkZero(1, 1)).rejects.toThrow(/No work position/);
    t.feed('<Run|MPos:10.000,20.000,0.000|FS:500,0|WCO:5.000,5.000,0.000>\r\n');
    await tick();
    await expect(c.shiftWorkZero(1, 1)).rejects.toThrow(/not Idle/);
    t.feed(idle);
    await tick();
    c.streamProgram(['G1 X1']);
    await expect(c.shiftWorkZero(1, 1)).rejects.toThrow(/program is running/);
    expect(t.lineWrites.some((l) => l.startsWith('G10'))).toBe(false);
  });

  it('rejects non-numeric offsets', async () => {
    const t = new FakeTransport();
    const c = new GrblController(t);
    t.feed(idle);
    await tick();
    await expect(c.shiftWorkZero(NaN, 0)).rejects.toThrow(/number/);
  });
});
