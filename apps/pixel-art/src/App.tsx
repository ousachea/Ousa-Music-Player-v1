import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { daemonUrl } from './daemon';
import { EMPTY, PALETTE, cellIndex, drawingScene, paint, setCell, useDrawings, type Drawing } from './drawings';
import { COLS, ROWS, Wall, blank, cellAt } from './led';
import { SCENES, type Scene } from './scenes';

type Prefs = { speed: number; bloom: number; cycleMin: number };

const SPEED: Record<string, number> = { slow: 0.5, normal: 1, fast: 1.8 };
const BLOOM: Record<string, number> = { off: 0, soft: 0.28, strong: 0.5 };
const FRAME_MS = 1000 / 30;
const HUD_MS = 4000;
// a drag has to travel this far sideways to count as a swipe between scenes rather than a tap
const SWIPE_PX = 60;

function usePrefs(client: BridgethingClient): Prefs {
  const [raw, setRaw] = useState<Record<string, string>>({});
  useEffect(() => {
    const off = client.config.onChanged(msg =>
      setRaw(prev => {
        const next = { ...prev };
        if (msg.value === null) delete next[msg.key];
        else next[msg.key] = msg.value;
        return next;
      }),
    );
    client.config
      .list()
      .then(r => r.ok && setRaw(Object.fromEntries(r.response.entries.map(e => [e.key, e.value]))))
      .catch(() => {});
    return off;
  }, [client]);
  return {
    speed: SPEED[raw.speed] ?? 1,
    bloom: BLOOM[raw.glow] ?? BLOOM.soft,
    cycleMin: Number(raw.cycle) || 0,
  };
}

// keeps a canvas the size of its box, in device pixels
function useCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(el.clientWidth * dpr);
      el.height = Math.round(el.clientHeight * dpr);
      setSize({ w: el.width, h: el.height });
    };
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    fit();
    return () => watch.disconnect();
  }, []);
  return { ref, size };
}

// a frozen frame of a scene, run on a little first so a fire has caught and the rain is falling
function Preview({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const frame = blank();
    const run = scene.start();
    for (let i = 0; i < 90; i++) run(frame, 1 / 30, new Date());
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const image = new ImageData(COLS, ROWS);
    for (let i = 0; i < frame.length; i += 4) {
      image.data[i] = Math.max(frame[i], scene.floor[0]);
      image.data[i + 1] = Math.max(frame[i + 1], scene.floor[1]);
      image.data[i + 2] = Math.max(frame[i + 2], scene.floor[2]);
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [scene]);
  return <canvas ref={ref} width={COLS} height={ROWS} className="h-full w-full [image-rendering:pixelated]" />;
}

function Pill({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-12 min-w-12 items-center justify-center rounded-full px-4 font-mono text-row tracking-[0.12em] uppercase ring-1 backdrop-blur-md transition active:scale-95 ${
        active ? 'bg-white text-black ring-white' : 'bg-black/60 text-near ring-white/15'
      }`}>
      {children}
    </button>
  );
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const prefs = usePrefs(client);
  const { drawings, save, remove } = useDrawings(client);
  const scenes = useMemo(() => [...SCENES, ...drawings.map((d, i) => drawingScene(d, i + 1))], [drawings]);

  const [sceneId, setSceneId] = useState('fire');
  const scene = scenes.find(s => s.id === sceneId) ?? scenes[0];
  const at = scenes.indexOf(scene);
  const [paused, setPaused] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [hud, setHud] = useState(true);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [colour, setColour] = useState(2);

  const { ref: canvas, size } = useCanvas();
  const wall = useMemo(() => new Wall(), []);
  const frame = useMemo(() => blank(), []);

  // the scene you left on is the one it comes back to
  useEffect(() => {
    client.store
      .get({ key: 'scene' })
      .then(r => r.ok && r.response.value && setSceneId(String(r.response.value)))
      .catch(() => {});
  }, [client]);
  const pick = useCallback(
    (id: string) => {
      setSceneId(id);
      client.store.put({ key: 'scene', value: id }).catch(() => {});
    },
    [client],
  );
  const step = useCallback((by: number) => pick(scenes[(at + by + scenes.length) % scenes.length].id), [at, pick, scenes]);

  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHud = useCallback(() => {
    setHud(true);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(false), HUD_MS);
  }, []);
  useEffect(() => {
    flashHud();
  }, [flashHud, sceneId]);

  // the wall: the scene steps and the frame is drawn at a steady thirty a second, which is plenty for
  // pixels this size and leaves the device room to breathe
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !size.w) return;
    const run = draft ? null : scene.start();
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (draft) paint(frame, draft.cells);
      else if (!paused) run!(frame, dt * prefs.speed, new Date());
      wall.draw(ctx, frame, size.w, size.h, prefs.bloom, draft ? [22, 22, 27] : scene.floor);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvas, draft, frame, paused, prefs.bloom, prefs.speed, scene, size, wall]);

  // left alone, it can move on through the scenes by itself
  useEffect(() => {
    if (!prefs.cycleMin || draft || gallery) return;
    const timer = setInterval(() => step(1), prefs.cycleMin * 60_000);
    return () => clearInterval(timer);
  }, [draft, gallery, prefs.cycleMin, step]);

  const startDrawing = useCallback(() => {
    setGallery(false);
    const existing = drawings.find(d => d.id === sceneId);
    setDraft(existing ?? { id: `d-${Date.now().toString(36)}`, cells: EMPTY });
  }, [drawings, sceneId]);

  const finishDrawing = useCallback(() => {
    if (draft && draft.cells !== EMPTY) {
      save(draft);
      pick(draft.id);
    }
    setDraft(null);
  }, [draft, pick, save]);

  // painting: the stroke takes the chosen colour, unless it starts on a cell already that colour, in
  // which case the whole stroke rubs out instead, so a mistake is undone with the same finger
  const stroke = useRef<{ colour: number; last: [number, number] } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const toCell = (e: PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    return cellAt(((e.clientX - r.left) * el.width) / r.width, ((e.clientY - r.top) * el.height) / r.height, el.width, el.height);
  };
  const paintLine = (from: [number, number], to: [number, number], with_: number) =>
    setDraft(d => {
      if (!d) return d;
      let cells = d.cells;
      const n = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), 1);
      for (let i = 0; i <= n; i++) {
        const x = Math.round(from[0] + ((to[0] - from[0]) * i) / n);
        const y = Math.round(from[1] + ((to[1] - from[1]) * i) / n);
        cells = setCell(cells, x, y, with_);
      }
      return { ...d, cells };
    });

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!draft) {
      swipe.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const c = toCell(e);
    if (!c) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const with_ = cellIndex(draft.cells, c[0], c[1]) === colour ? 0 : colour;
    stroke.current = { colour: with_, last: c };
    paintLine(c, c, with_);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!draft || !s) return;
    const c = toCell(e);
    if (!c || (c[0] === s.last[0] && c[1] === s.last[1])) return;
    paintLine(s.last, c, s.colour);
    s.last = c;
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    stroke.current = null;
    const from = swipe.current;
    swipe.current = null;
    if (draft || !from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - from.y)) step(dx < 0 ? 1 : -1);
    else if (hud) setHud(false);
    else flashHud();
  };

  // the wheel moves through the list on screen: the scenes, the colours while drawing, or the gallery
  useEffect(() => {
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      if (gallery) {
        const list = document.querySelector<HTMLElement>('[data-gallery]');
        if (list) list.scrollTop += e.deltaX * 30;
        return;
      }
      acc += e.deltaX;
      const n = Math.trunc(acc);
      if (!n) return;
      acc -= n;
      const by = Math.sign(n);
      if (draft) setColour(c => (c + by + PALETTE.length) % PALETTE.length);
      else step(by);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') {
        if (draft) finishDrawing();
        else setGallery(g => !g);
      } else if (draft) {
        if (e.key === '1') setColour(c => (c + PALETTE.length - 1) % PALETTE.length);
        else if (e.key === '3') setColour(c => (c + 1) % PALETTE.length);
        else if (e.key === '2') setColour(0);
        else if (e.key === '4') finishDrawing();
      } else if (e.key === '1' || e.key === 'ArrowLeft') step(-1);
      else if (e.key === '3' || e.key === 'ArrowRight') step(1);
      else if (e.key === '2' || e.key === ' ') setPaused(p => !p);
      else if (e.key === '4') startDrawing();
      else if (e.key === 'm' || e.key === 'M') setGallery(g => !g);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [draft, finishDrawing, gallery, startDrawing, step]);

  const isDrawing = drawings.some(d => d.id === scene.id);

  return (
    <div className="relative flex h-full w-full bg-black text-off-white">
      <canvas
        ref={canvas}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (stroke.current = null)}
        className={`h-full min-w-0 flex-1 touch-none ${draft ? 'cursor-crosshair' : ''}`}
      />

      {/* the drawing tools take a column of their own, so nothing sits over the cells being painted */}
      {draft && (
        <div className="flex w-[168px] shrink-0 flex-col gap-3 border-l border-white/10 bg-[#0b0b0d] p-3">
          <div className="font-mono text-eyebrow tracking-[0.25em] text-dim uppercase">
            {drawings.some(d => d.id === draft.id) ? 'Editing' : 'New drawing'}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PALETTE.map(([r, g, b], i) => (
              <button
                key={i}
                aria-label={i === 0 ? 'eraser' : `colour ${i}`}
                onClick={() => setColour(i)}
                className={`relative aspect-square rounded-md transition active:scale-90 ${
                  i === colour ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0b0b0d]' : 'ring-1 ring-white/10'
                }`}
                style={{ backgroundColor: `rgb(${r},${g},${b})`, boxShadow: i ? `0 0 10px rgba(${r},${g},${b},0.45)` : undefined }}>
                {i === 0 && <span className="absolute inset-0 grid place-items-center font-mono text-[0.65rem] text-white/60">off</span>}
              </button>
            ))}
          </div>
          <p className="text-hint leading-snug text-dim">Drag to paint. Start on a cell of the same colour to rub out.</p>
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={() => setDraft(d => (d ? { ...d, cells: EMPTY } : d))}
              className="h-10 rounded-xl bg-white/8 text-row text-near transition active:scale-95">
              Clear
            </button>
            {drawings.some(d => d.id === draft.id) && (
              <button
                onClick={() => {
                  remove(draft.id);
                  setDraft(null);
                  pick('fire');
                }}
                className="h-10 rounded-xl bg-white/8 text-row text-[#ff7070] transition active:scale-95">
                Delete
              </button>
            )}
            <button onClick={finishDrawing} className="h-10 rounded-xl bg-white text-row font-semibold text-black transition active:scale-95">
              Done
            </button>
          </div>
        </div>
      )}

      {!draft && (
        <div
          className={`pointer-events-none absolute inset-0 flex flex-col justify-between p-4 transition-opacity duration-500 ${
            hud && !gallery ? 'opacity-100' : 'opacity-0'
          }`}>
          <div className="flex items-baseline gap-3">
            <span className="rounded-full bg-black/60 px-4 py-1.5 font-mono text-row tracking-[0.18em] uppercase ring-1 ring-white/15 backdrop-blur-md">
              {scene.name}
            </span>
            <span className="font-mono text-hint text-dim">
              {at + 1} / {scenes.length}
              {paused ? ' · paused' : ''}
            </span>
          </div>
          <div className={`flex justify-center gap-2 ${hud && !gallery ? 'pointer-events-auto' : ''}`}>
            <Pill label="previous scene" onClick={() => step(-1)}>
              ‹
            </Pill>
            <Pill label="all scenes" onClick={() => setGallery(true)}>
              Scenes
            </Pill>
            <Pill label={paused ? 'play' : 'pause'} onClick={() => setPaused(p => !p)} active={paused}>
              {paused ? 'Play' : 'Pause'}
            </Pill>
            <Pill label={isDrawing ? 'edit drawing' : 'new drawing'} onClick={startDrawing}>
              {isDrawing ? 'Edit' : 'Draw'}
            </Pill>
            <Pill label="next scene" onClick={() => step(1)}>
              ›
            </Pill>
          </div>
        </div>
      )}

      {gallery && !draft && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/92 px-6 pt-5 pb-4 backdrop-blur-sm">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-hint tracking-[0.25em] text-dim uppercase">Scenes</span>
            <span className="text-hint text-dim">the button under the wheel closes this</span>
          </div>
          <div data-gallery className="mt-3 grid min-h-0 flex-1 grid-cols-4 content-start gap-3 overflow-y-auto [scrollbar-width:none]">
            {scenes.map(s => (
              <button
                key={s.id}
                onClick={() => {
                  pick(s.id);
                  setGallery(false);
                }}
                className={`overflow-hidden rounded-xl text-left ring-2 transition active:scale-95 ${s.id === scene.id ? 'ring-white' : 'ring-transparent'}`}>
                <div className="aspect-[32/19] bg-black">
                  <Preview scene={s} />
                </div>
                <div className="bg-white/6 px-3 py-2 font-mono text-hint tracking-[0.15em] uppercase">{s.name}</div>
              </button>
            ))}
            <button
              onClick={() => {
                setSceneId('fire');
                setGallery(false);
                setDraft({ id: `d-${Date.now().toString(36)}`, cells: EMPTY });
              }}
              className="grid aspect-[32/24] place-items-center rounded-xl border-2 border-dashed border-white/20 font-mono text-hint tracking-[0.15em] text-dim uppercase transition active:scale-95">
              + New drawing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
