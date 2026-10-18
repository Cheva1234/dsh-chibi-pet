/**
 * Chibi Pet — browser half of the `dsh-chibi-pet` bundle.
 *
 * Two registrations, one shared signal:
 *
 *   `conversation.composer.dock`  a session-scoped sensor. It reads the live
 *                                 Session and Chat facts the slot hands it and
 *                                 publishes them into a module-local store. It
 *                                 renders nothing.
 *   `shell.overlay`               the frame-wide floating layer. It owns the
 *                                 pet: a canvas playing the sprite atlases, its
 *                                 state machine, pointer capture, and position.
 *
 * The sensor is the accurate source: it is the only surface that can tell a
 * model call from a running tool call, and the only one that sees a turn's
 * error. The overlay's own status map is the fallback used while no
 * conversation is mounted, so the pet keeps reporting background work instead
 * of falling asleep on the job.
 *
 * Boundaries taken from the artwork's own interaction contract:
 *   - gestures never approve, deny, submit or dismiss anything;
 *   - `waiting` plays once per new pending-interaction key and holds its last
 *     pose until that interaction is answered;
 *   - `success`/`error` fire on a real turn edge, never on silence;
 *   - a head pat never interrupts an approval or a failure;
 *   - `prefers-reduced-motion` pins the pet to the first pose of each state.
 */
window.__ModuleLoader__.load({
  id: /*@__MODULE_ID@*/ 'dsh-chibi-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /* ------------------------------------------------------------------ *
     * Sprite data. Injected verbatim by tools/build_sprites.py; the `null`
     * below is what an unbuilt bundle keeps, so a missing build reports one
     * clear console line instead of rendering an empty slot entry.
     * ------------------------------------------------------------------ */
    const SPRITES = /*@__SPRITES@*/ null;

    if (!SPRITES) {
      return {
        inject: ['slots'],
        apply() {
          console.error('[dsh-pet] bundle has no sprite data — run tools/build_sprites.py');
        },
      };
    }

    const ATLAS_COLUMNS = SPRITES.columns;
    const FRAME_W = SPRITES.frameWidth;
    const FRAME_H = SPRITES.frameHeight;
    const PET_W = SPRITES.displayWidth;
    const PET_H = Math.round((FRAME_H / FRAME_W) * PET_W);
    const STATES = SPRITES.states;
    const STATE_NAMES = Object.keys(STATES);

    const CROSSFADE_MS = 140; // inside the 100–180 ms budget the spec allows
    const SLEEP_AFTER_MS = 90 * 1000;
    const SETTLE_MS = 250; // a freshly loaded page is not yet ready to be greeted
    const SUCCESS_MIN_RUN_MS = 600; // a turn must have actually done something
    const SLOP_PX = 4; // pointer travel below this is still a click
    const EDGE_MARGIN = 20;
    const STORAGE_KEY = 'dsh-chibi-pet.position.v1';
    const SESSION_KEY = 'dsh-chibi-pet.session.v1';
    const PREFS_KEY = 'dsh-chibi-pet.prefs.v1';
    /** Pre-1.0 keys, moved across once on the first run of this version. */
    const LEGACY_KEYS = [
      ['dsh-pet.position.v1', STORAGE_KEY],
      ['dsh-pet.session.v1', SESSION_KEY],
    ];
    /** Display widths in CSS px; every size is drawn from the same 2x atlas. */
    const SIZES = { small: 84, medium: 112, large: 140 };
    /** Offered nap delays in seconds; 0 means the pet never naps. */
    const NAP_CHOICES = [30, 60, 90, 300, 0];
    const PREF_DEFAULTS = { enabled: true, size: 'medium', napSeconds: 90, follow: false };
    const SCROLL_GLYPH =
      'M8 0.8 10.4 3.6H5.6L8 0.8Zm0 2.9c3.4 0 6.2 2.6 6.2 5.9S11.4 15.2 8 15.2'
      + ' 1.8 12.6 1.8 9.6 4.6 3.7 8 3.7Zm-2.1 4.6a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Zm4.2 0a1.15 1.15 0 1 0 0 2.3'
      + ' 1.15 1.15 0 0 0 0-2.3Z';

    /**
     * Carried poses (atlas indices of the `drag` state), graded by how fast the
     * pointer is moving.
     *
     * The six drag drawings are one swing cycle: 02 and 05 are the upright
     * middle, 01/03 are the full opposite swings, and 04/06 are the weaker
     * repeats of 01/03. So a pet you merely hold hangs calmly on the neutral
     * drawing, a slow drag leans a little into the direction of travel, and a
     * fast drag swings out fully. Swap any index to change that pose.
     */
    const DRAG_POSES = {
      neutral: 1, // drag-02
      soft: { right: 3, left: 5 }, // drag-04 / drag-06
      hard: { right: 0, left: 2 }, // drag-01 / drag-03
    };
    /**
     * How far the pointer has carried the pet, in px, at which the pose steps
     * up. Distance rather than pointer speed: a drag you pause in the middle of
     * must not fall back to hanging straight down.
     */
    const DRAG_BEND = { soft: 40, hard: 160 };

    const NS = 'dsh-pet';
    const DICT = {
      en: {
        'pet.label': 'Chibi pet',
        'pet.aria': 'Chibi pet — {state}',
        'pet.hint': 'click for a head pat · drag to move · right-click to send home',
        'state.idle': 'idling',
        'state.thinking': 'thinking',
        'state.working': 'using tools',
        'state.waiting': 'waiting for you',
        'state.success': 'finished',
        'state.error': 'hit an error',
        'state.head-pat': 'enjoying a head pat',
        'state.drag': 'being carried',
        'state.sleep': 'asleep',
        'state.greeting': 'saying hello',
        'chat.open': 'Talk to the pet',
        'chat.placeholder': 'Give the pet some work…',
        'chat.send': 'Send',
        'chat.untitled': 'This conversation',
        'chat.unbound': 'No conversation yet',
        'chat.follow': 'Follow this conversation',
        'chat.gone': 'gone',
        'chat.sent': 'Queued. It will start as soon as the session is free.',
        'chat.unboundHint': 'Open a conversation, then the pet will attach to it.',
        'chat.failed': 'Could not send',
        'chat.state': 'Feels: {state}',
        'chat.followMode': 'Follow the conversation I am viewing',
        'chat.followHint': 'Off: the pet stays with one conversation.',
        'chat.size': 'Size',
        'toggle.label': 'Pet',
        'toggle.on': 'Pet is showing',
        'toggle.off': 'Pet is hidden',
        'toggle.hint': 'show or hide the pet',
        'toggle.attention': 'The pet has something for you',
        'prefs.title': 'Chibi pet',
        'prefs.hint': 'Show the floating pet in this window',
        'prefs.size': 'Pet size',
        'prefs.size.hint': 'How large the pet is drawn',
        'prefs.nap': 'Pet nap time',
        'prefs.nap.hint': 'How long the pet stays idle before it falls asleep',
        'prefs.size.small': 'Small',
        'prefs.size.medium': 'Medium',
        'prefs.size.large': 'Large',
        'prefs.nap.seconds': '{count} seconds',
        'prefs.nap.minutes': '{count} min',
        'prefs.nap.never': 'Never',
        'shortcut.toggle': 'Show or hide the pet',
      },
      zh: {
        'pet.label': 'Q 版宠物',
        'pet.aria': 'Q 版宠物 — {state}',
        'pet.hint': '点一下摸头 · 拖动换位置 · 右键回到角落',
        'state.idle': '发呆中',
        'state.thinking': '思考中',
        'state.working': '忙着干活',
        'state.waiting': '等你处理',
        'state.success': '干完了',
        'state.error': '出错了',
        'state.head-pat': '被摸头',
        'state.drag': '被拎起来了',
        'state.sleep': '睡着了',
        'state.greeting': '跟你打招呼',
        'chat.open': '跟宠物说话',
        'chat.placeholder': '派点活给宠物…',
        'chat.send': '发送',
        'chat.untitled': '这个会话',
        'chat.unbound': '还没有会话',
        'chat.follow': '跟随这个会话',
        'chat.gone': '已不存在',
        'chat.sent': '已排队，会话一空下来就会开始。',
        'chat.unboundHint': '先打开一个会话，宠物就会跟它绑定。',
        'chat.failed': '发送失败',
        'chat.state': '现在：{state}',
        'chat.followMode': '跟着我正在看的会话',
        'chat.followHint': '关闭时，宠物只留在一个会话里。',
        'chat.size': '大小',
        'toggle.label': '宠物',
        'toggle.on': '已显示宠物',
        'toggle.off': '已隐藏宠物',
        'toggle.hint': '显示或隐藏宠物',
        'toggle.attention': '宠物有事情找你',
        'prefs.title': 'Q 版宠物',
        'prefs.hint': '在这个窗口里显示悬浮宠物',
        'prefs.size': '宠物大小',
        'prefs.size.hint': '宠物画多大',
        'prefs.nap': '宠物打盹时间',
        'prefs.nap.hint': '空闲多久之后睡着',
        'prefs.size.small': '小',
        'prefs.size.medium': '中',
        'prefs.size.large': '大',
        'prefs.nap.seconds': '{count} 秒',
        'prefs.nap.minutes': '{count} 分钟',
        'prefs.nap.never': '从不',
        'shortcut.toggle': '显示或隐藏宠物',
      },
    };

    /**
     * Call a selector hook the host slot hands us, or take the fallback.
     *
     * This is a plain-JS bundle with no type check of its own, and the standard
     * props a slot supplies can differ across Harness versions. The branch is
     * decided by the props object, which never changes during one component's
     * life, so hook order stays stable. A missing hook degrades the pet by one
     * signal instead of blanking the slot entry.
     */
    function useOptional(hook, selector, fallback) {
      return typeof hook === 'function' ? hook(selector) : fallback;
    }

    /** Module-local signal channel between the sensor and the overlay. */
    function createSignal() {
      let current = {
        focused: false,
        sessionId: null,
        running: false,
        pendingKey: null,
        thinking: false,
        working: false,
        error: null,
      };
      const listeners = new Set();
      const same = (a, b) =>
        a.focused === b.focused &&
        a.sessionId === b.sessionId &&
        a.running === b.running &&
        a.pendingKey === b.pendingKey &&
        a.thinking === b.thinking &&
        a.working === b.working &&
        a.error === b.error;
      return {
        get() {
          return current;
        },
        publish(patch) {
          const next = Object.assign({}, current, patch);
          if (same(current, next)) return;
          current = next;
          listeners.forEach((listener) => {
            try {
              listener(next);
            } catch (error) {
              console.error('[dsh-pet] signal listener failed', error);
            }
          });
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    /**
     * The pet's behaviour: a fold over the published signal, evaluated once per
     * animation frame. One-shots therefore expire on their own recorded
     * deadline instead of needing timers — a finished gesture simply stops
     * outranking the base stance.
     */
    function createMachine() {
      const mem = {
        created: 0,
        primed: false,
        greeted: false,
        sessionId: null,
        oneShot: null,
        hold: false,
        until: 0,
        token: 1,
        name: 'idle',
        activity: null,
        prevRunning: false,
        runningSince: 0,
        seenPending: null,
        seenError: null,
        lastActive: 0,
      };

      function enter(name) {
        if (mem.name !== name) {
          mem.name = name;
          mem.token += 1;
        }
        return { name: mem.name, token: mem.token };
      }

      function fire(name, now, hold) {
        mem.oneShot = name;
        mem.hold = !!hold;
        mem.until = hold ? Infinity : now + STATES[name].durationMs;
        mem.token += 1;
        mem.name = name;
        return { name: mem.name, token: mem.token };
      }

      function base(activity, now, napAfterMs) {
        if (activity.pendingKey) return 'waiting';
        if (activity.running) return activity.working ? 'working' : 'thinking';
        if (napAfterMs > 0 && now - mem.lastActive > napAfterMs) return 'sleep';
        return 'idle';
      }

      return {
        /** Current animation state (labels, and the only thing tests need). */
        peek() {
          return { name: mem.name, token: mem.token };
        },

        /** A deliberate head interaction: never allowed to interrupt urgency. */
        headPat(now) {
          const activity = mem.activity;
          if (!mem.primed || !activity) return;
          if (activity.pendingKey) return; // an approval is waiting on the user
          if (mem.oneShot === 'error') return; // let the failure stay on screen
          mem.lastActive = now;
          fire('head-pat', now);
        },

        step(activity, now, napAfterMs) {
          const nap = napAfterMs === undefined ? SLEEP_AFTER_MS : napAfterMs;
          mem.activity = activity;
          if (!mem.created) mem.created = now;

          // The pet is per-frame, but the signal is per-session: a different
          // session re-baselines every edge, so switching conversations never
          // reads as "a turn just finished".
          if (mem.sessionId !== activity.sessionId) {
            mem.sessionId = activity.sessionId;
            mem.primed = false;
          }

          // Being carried is deliberately not a pose. The pet keeps the stance
          // its session is in; the component only mirrors it left or right.

          if (!mem.primed) {
            // 2. Settle, then greet once — but never over live work.
            if (!mem.greeted && now - mem.created < SETTLE_MS) return enter('idle');
            const decision = !mem.greeted;
            mem.greeted = true;
            mem.primed = true;
            mem.seenPending = activity.pendingKey;
            mem.seenError = activity.error;
            mem.prevRunning = activity.running;
            mem.runningSince = activity.running ? now : 0;
            mem.lastActive = now;
            if (decision && !activity.running && !activity.pendingKey) return fire('greeting', now);
          } else {
            // 3. A genuinely new approval or question is announced exactly once.
            if (activity.pendingKey && activity.pendingKey !== mem.seenPending) {
              mem.seenPending = activity.pendingKey;
              mem.lastActive = now;
              fire('waiting', now, true);
            } else if (!activity.pendingKey && mem.seenPending) {
              mem.seenPending = null;
              mem.lastActive = now;
            }
            if (!activity.pendingKey && mem.hold) {
              mem.oneShot = null;
              mem.hold = false;
            }

            if (activity.running) {
              mem.lastActive = now;
              if (!mem.prevRunning) mem.runningSince = now;
            }

            // 4. A failure the user has not seen yet gets the startle face.
            let noticed = false;
            if (activity.error && activity.error !== mem.seenError) {
              mem.seenError = activity.error;
              mem.lastActive = now;
              fire('error', now);
              noticed = true;
            }

            // 5. A turn that just ended gets the cheer — unless it failed, and
            //    unless it ended so fast that nothing happened.
            if (!activity.running && mem.prevRunning && !noticed) {
              mem.lastActive = now;
              if (now - mem.runningSince > SUCCESS_MIN_RUN_MS) fire('success', now);
            }

            mem.prevRunning = activity.running;
          }

          // 6. A live one-shot outranks the base stance; otherwise fall through.
          if (mem.oneShot && (mem.hold || now < mem.until)) {
            return { name: mem.oneShot, token: mem.token };
          }
          if (mem.oneShot) {
            mem.oneShot = null;
            mem.hold = false;
          }
          return enter(base(activity, now, nap));
        },
      };
    }

    /** Canvas playback of one atlas, with an optional pinned pose and crossfade. */
    function createSprite(canvas) {
      const context = canvas.getContext('2d');
      if (!context) return null;

      const images = {};
      const loaded = {};
      for (const name of STATE_NAMES) {
        const image = new Image();
        loaded[name] = false;
        image.addEventListener('load', () => {
          loaded[name] = true;
        }, { once: true });
        image.src = STATES[name].src;
        if (image.complete) loaded[name] = true;
        images[name] = image;
      }

      let cursor = null; // { name, token, index, started } — the timeline
      let drawn = null; // { name, index } — the frame actually on the canvas
      let fading = null; // { image, sx, sy, start }
      let lastGood = null; // { image, sx, sy } — holds the pose across a decode

      function rectOf(index) {
        return [
          (index % ATLAS_COLUMNS) * FRAME_W,
          Math.floor(index / ATLAS_COLUMNS) * FRAME_H,
        ];
      }

      /** Advance the timeline cursor; a pinned or reduced-motion pose stays put. */
      function step(state, now, reduced, pinned) {
        if (!cursor || cursor.name !== state.name || cursor.token !== state.token) {
          cursor = { name: state.name, token: state.token, index: 0, started: now };
          return;
        }
        if (reduced || pinned) {
          cursor.index = 0;
          return;
        }
        const sequence = STATES[state.name].sequence;
        let guard = 0;
        while (guard < 64) {
          guard += 1;
          const duration = sequence[cursor.index][1];
          if (now - cursor.started < duration) break;
          cursor.started += duration;
          if (cursor.index + 1 < sequence.length) cursor.index += 1;
          else if (STATES[state.name].loop) cursor.index = 0;
          else {
            cursor.started = now; // one-shot: hold the final pose
            break;
          }
        }
      }

      /**
       * @param state - the stance the machine resolved.
       * @param now - frame timestamp.
       * @param reduced - reduced-motion preference.
       * @param pin - `{ state, frame }` to draw one exact pose instead of the
       *   timeline; that is how a carried pet shows which way it is going.
       */
      function paint(state, now, reduced, pin) {
        const effective = pin
          ? { name: pin.state, token: 'pin:' + pin.state + ':' + pin.frame }
          : state;
        step(effective, now, reduced, !!pin);
        const sequence = STATES[cursor.name].sequence;
        const index = pin
          ? sequence[Math.min(pin.frame, sequence.length - 1)][0]
          : sequence[Math.min(cursor.index, sequence.length - 1)][0];
        const [sx, sy] = rectOf(index);
        const width = canvas.width;
        const height = canvas.height;

        // A change of the drawn frame starts the short crossfade.
        if (!drawn || drawn.name !== cursor.name || drawn.index !== index) {
          if (drawn && loaded[drawn.name]) {
            const [previousX, previousY] = rectOf(drawn.index);
            fading = { image: images[drawn.name], sx: previousX, sy: previousY, start: now };
          }
          drawn = { name: cursor.name, index };
        }

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, width, height);

        if (!loaded[cursor.name]) {
          // The atlas is still decoding: hold the last pose instead of blinking.
          if (lastGood) {
            context.globalAlpha = 1;
            context.drawImage(lastGood.image, lastGood.sx, lastGood.sy, FRAME_W, FRAME_H, 0, 0, width, height);
          }
          return;
        }

        const elapsed = fading ? now - fading.start : CROSSFADE_MS;
        if (!reduced && fading && elapsed < CROSSFADE_MS) {
          // The outgoing pose stays opaque and the new one fades in over it, so
          // the silhouette never thins out in the middle of a state change.
          context.globalAlpha = 1;
          context.drawImage(fading.image, fading.sx, fading.sy, FRAME_W, FRAME_H, 0, 0, width, height);
          context.globalAlpha = elapsed / CROSSFADE_MS;
        } else {
          fading = null;
          context.globalAlpha = 1;
        }
        context.drawImage(images[cursor.name], sx, sy, FRAME_W, FRAME_H, 0, 0, width, height);
        context.globalAlpha = 1;
        lastGood = { image: images[cursor.name], sx, sy };
      }

      return { paint };
    }

    /** Keep the pet on screen; `size` follows the chosen display size. */
    function clampToViewport(point, size) {
      const width = (size && size.w) || PET_W;
      const height = (size && size.h) || PET_H;
      const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
      const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
      return {
        x: Math.min(Math.max(point.x, EDGE_MARGIN), maxX),
        y: Math.min(Math.max(point.y, EDGE_MARGIN), maxY),
      };
    }

    function defaultPosition(size) {
      const width = (size && size.w) || PET_W;
      const height = (size && size.h) || PET_H;
      return clampToViewport({
        x: window.innerWidth - width - EDGE_MARGIN,
        y: window.innerHeight - height - EDGE_MARGIN,
      }, size);
    }

    /** Remembered as a fraction of the viewport, so it survives a resize. */
    function readPosition(size) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultPosition(size);
        const stored = JSON.parse(raw);
        if (typeof stored.fx !== 'number' || typeof stored.fy !== 'number') return defaultPosition(size);
        return clampToViewport({
          x: stored.fx * window.innerWidth,
          y: stored.fy * window.innerHeight,
        }, size);
      } catch (error) {
        return defaultPosition(size);
      }
    }

    function writePosition(point) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          fx: point.x / Math.max(1, window.innerWidth),
          fy: point.y / Math.max(1, window.innerHeight),
        }));
      } catch (error) {
        /* a pet that cannot remember where it sat is still a working pet */
      }
    }

    function prefersReducedMotion() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    const ROOT_CLASS = 'dsh-chibi-pet-root';

    /* ------------------------------------------------------------------ *
     * Preferences and attention, shared by every surface that can change
     * the pet (overlay, sidebar button, Settings rows, keyboard command).
     * ------------------------------------------------------------------ */

    /** Move pre-1.0 keys across once, so an upgrade keeps position and session. */
    function migrateStorage() {
      for (const [from, to] of LEGACY_KEYS) {
        try {
          const value = window.localStorage.getItem(from);
          if (value === null) continue;
          if (window.localStorage.getItem(to) === null) window.localStorage.setItem(to, value);
          window.localStorage.removeItem(from);
        } catch (error) {
          /* private mode or a full quota: defaults stay usable */
        }
      }
    }

    /** Coerce anything read from storage into a complete, valid preference set. */
    function sanitizePrefs(value) {
      return {
        enabled: value.enabled !== false,
        size: Object.prototype.hasOwnProperty.call(SIZES, value.size) ? value.size : PREF_DEFAULTS.size,
        napSeconds: NAP_CHOICES.indexOf(value.napSeconds) === -1
          ? PREF_DEFAULTS.napSeconds
          : value.napSeconds,
        follow: value.follow === true,
      };
    }

    function samePrefs(left, right) {
      return left.enabled === right.enabled
        && left.size === right.size
        && left.napSeconds === right.napSeconds
        && left.follow === right.follow;
    }

    /**
     * The pet's user-facing preferences.
     *
     * A snapshot store, so every surface renders from one value and the
     * keyboard command, the sidebar button and the Settings rows cannot drift.
     * Kept in `localStorage`: it is a per-browser display preference, and the
     * pet must work before any Host round trip completes.
     */
    function createPrefs() {
      let current = read();
      const listeners = new Set();

      function read() {
        let stored = {};
        try {
          const raw = window.localStorage.getItem(PREFS_KEY);
          if (raw) stored = JSON.parse(raw) || {};
        } catch (error) {
          stored = {};
        }
        return sanitizePrefs(Object.assign({}, PREF_DEFAULTS, stored));
      }

      function notify() {
        listeners.forEach((listener) => {
          try {
            listener();
          } catch (error) {
            console.error('[dsh-chibi-pet] preference listener failed', error);
          }
        });
      }

      const store = {
        getSnapshot: () => current,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set(patch) {
          const next = sanitizePrefs(Object.assign({}, current, patch));
          if (samePrefs(current, next)) return current;
          current = next;
          try {
            window.localStorage.setItem(PREFS_KEY, JSON.stringify(current));
          } catch (error) {
            /* the choice still applies to this page */
          }
          notify();
          return current;
        },
        toggle() {
          return store.set({ enabled: !current.enabled });
        },
      };
      return store;
    }

    /**
     * Whatever happened to the bound session while you were looking elsewhere.
     * Raised by the pet's own state machine and shown on the pet and on the
     * sidebar button, cleared as soon as the pet or its session is looked at.
     */
    function createAttention() {
      let current = { count: 0, kind: null };
      const listeners = new Set();
      return {
        getSnapshot: () => current,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        raise(kind) {
          current = { count: current.count + 1, kind };
          listeners.forEach((listener) => {
            try {
              listener();
            } catch (error) {
              /* a badge is never worth breaking a frame for */
            }
          });
        },
        clear() {
          if (current.count === 0) return;
          current = { count: 0, kind: null };
          listeners.forEach((listener) => {
            try {
              listener();
            } catch (error) {
              /* ignore */
            }
          });
        },
      };
    }

    /** The pet's head as an icon, filled with `currentColor`. */
    function PetGlyph(props) {
      const size = (props && props.size) || 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      }, h('path', { d: SCROLL_GLYPH, fill: 'currentColor', fillRule: 'evenodd' }));
    }

    /** Shared stylesheet for the surfaces that cannot rely on inline hover. */
    const STYLE = [
      '@keyframes dsh-chibi-pet-arrive{from{opacity:0;transform:translateY(8px) scale(.92)}to{opacity:1;transform:none}}',
      '.' + ROOT_CLASS + '{animation:dsh-chibi-pet-arrive .28s ease-out}',
      '@media (prefers-reduced-motion: reduce){.' + ROOT_CLASS + '{animation:none}}',
      '.' + ROOT_CLASS + ':focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:4px;border-radius:16px}',
      '.dsh-chibi-pet-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dsh-chibi-pet-rowText{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;padding-right:48px}',
      '.dsh-chibi-pet-rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.dsh-chibi-pet-rowHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dsh-chibi-pet-select{height:32px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-module-platform);'
        + 'color:var(--dsw-alias-label-primary);border:none;padding:0 10px;font:inherit;font-size:14px;cursor:pointer;flex:none}',
      '.dsh-chibi-pet-select:disabled{opacity:.5;cursor:default}',
      '.dsh-chibi-pet-select:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-chibi-pet-switch{width:40px;height:22px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);'
        + 'background:var(--dsw-alias-bg-module-platform);cursor:pointer;padding:0;position:relative;flex:none;transition:background .15s}',
      '.dsh-chibi-pet-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}',
      '.dsh-chibi-pet-switch>span{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;'
        + 'background:var(--dsw-alias-label-tertiary);transition:left .15s,background .15s}',
      '.dsh-chibi-pet-switch[aria-checked="true"]>span{left:20px;background:var(--dsw-alias-bg-base)}',
      // The sidebar foot is a row of chips shared with other plugins (the credit
      // monitor lives here too), so this is an intrinsically sized chip, never a
      // full-width row: it must not push its neighbours out of the row.
      '.dsh-chibi-pet-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;'
        + 'max-width:100%;box-sizing:border-box;padding:0 8px;position:relative;border:1px solid transparent;border-radius:8px;'
        + 'background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;font-weight:600;line-height:1}',
      '.dsh-chibi-pet-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      // A hidden pet has to be obvious at a glance in the foot row, where the
      // chip sits beside unrelated controls.
      '.dsh-chibi-pet-toggle[aria-checked="false"]{color:var(--dsw-alias-label-tertiary);opacity:.62}',
      '.dsh-chibi-pet-toggle[aria-checked="false"]:hover{opacity:1}',
      '.dsh-chibi-pet-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-chibi-pet-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-chibi-pet-dot{position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;'
        + 'background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 1.5px var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base))}',
    ].join('');

    /**
     * The carried pose for how far the pet has been carried.
     *
     * Merely taken hold of (no distance yet) it hangs straight down; the
     * further it is carried, the more it leans into the direction of travel,
     * up to the full swing. Pausing mid-drag changes nothing, and `facing` is
     * 1 for a rightward drag, -1 for a leftward one.
     *
     * @returns the `drag` atlas index to draw.
     */
    function dragPose(distance, facing) {
      const carried = distance || 0;
      const level = carried >= DRAG_BEND.hard
        ? 'hard'
        : carried >= DRAG_BEND.soft ? 'soft' : 'neutral';
      return level === 'neutral'
        ? DRAG_POSES.neutral
        : DRAG_POSES[level][facing < 0 ? 'left' : 'right'];
    }

    /** Remember which single session the pet belongs to. */
    function readBoundSession() {
      try {
        const value = window.localStorage.getItem(SESSION_KEY);
        return value || null;
      } catch (error) {
        return null;
      }
    }

    function writeBoundSession(sessionId) {
      try {
        if (sessionId) window.localStorage.setItem(SESSION_KEY, sessionId);
        else window.localStorage.removeItem(SESSION_KEY);
      } catch (error) {
        /* an unremembered pet still follows the session it was given */
      }
    }

    /**
     * Send one line of work into a session, exactly as the composer does:
     * retain the generation, wait until it is usable, prompt it as the user.
     * Queue mode is deliberate — a pet must never interrupt a running turn.
     */
    function createSender(sessions) {
      return async function send(sessionId, text) {
        return sessions.using(sessionId, { source: 'pet' }, async (reference) => {
          await reference.ready;
          const session = reference.binding.session;
          const result = await session.prompt([{ type: 'text', text }], 'queue');
          if (!result || result.ok !== true) {
            const failure = result && result.error;
            throw new Error((failure && (failure.message || failure.code)) || 'prompt rejected');
          }
          return result.value;
        });
      };
    }

    /** Build the two slot components around one shared signal and translator. */
    function createComponents(t, signal, send, prefs, attention) {
      function PetSensor(props) {
        const sessionId = props.sessionId;
        const running = useOptional(props.useSession, (snapshot) => !!snapshot.running, false);
        const error = useOptional(props.useSession, (snapshot) => snapshot.lastAgentError || null, null);
        const pendingKey = useOptional(props.useSessionStatus, (statuses) => {
          const status = sessionId ? statuses.get(sessionId) : undefined;
          return status && status.pendingInteraction ? String(status.pendingInteraction.key) : null;
        }, null);
        const thinking = useOptional(props.useChat, (snapshot) => !!(snapshot.legacy && snapshot.legacy.partial), false);
        const working = useOptional(props.useChat, (snapshot) => !!(snapshot.legacy
          && snapshot.legacy.runningCalls
          && snapshot.legacy.runningCalls.length), false);

        React.useEffect(() => () => {
          signal.publish({
            focused: false,
            sessionId: null,
            running: false,
            pendingKey: null,
            thinking: false,
            working: false,
            error: null,
          });
        }, []);

        React.useEffect(() => {
          signal.publish({
            focused: true,
            sessionId: sessionId || null,
            running,
            pendingKey,
            thinking,
            working,
            error,
          });
        }, [sessionId, running, pendingKey, thinking, working, error]);

        return null;
      }

      function PetOverlay(props) {
        const state = React.useSyncExternalStore(prefs.subscribe, prefs.getSnapshot);
        const attentionState = React.useSyncExternalStore(attention.subscribe, attention.getSnapshot);
        const petW = SIZES[state.size] || SIZES.medium;
        const petH = Math.round((FRAME_H / FRAME_W) * petW);
        const size = { w: petW, h: petH };
        const [position, setPosition] = React.useState(() => readPosition(size));
        const [stateName, setStateName] = React.useState('idle');
        const [carrying, setCarrying] = React.useState(false);
        const [boundId, setBoundId] = React.useState(readBoundSession);
        const [visibleId, setVisibleId] = React.useState(null);
        const [chatOpen, setChatOpen] = React.useState(false);
        const [draft, setDraft] = React.useState('');
        const [sending, setSending] = React.useState(false);
        const [notice, setNotice] = React.useState(null);

        const canvasRef = React.useRef(null);
        const petRef = React.useRef(null);
        const chatButtonRef = React.useRef(null);
        const bubbleRef = React.useRef(null);
        const inputRef = React.useRef(null);
        const dragRef = React.useRef(null);
        const facingRef = React.useRef(1); // 1 = travelling right, -1 = left
        const activityRef = React.useRef(signal.get());
        const reducedRef = React.useRef(prefersReducedMotion());
        const machineRef = React.useRef(null);
        if (!machineRef.current) machineRef.current = createMachine();
        const boundRef = React.useRef(boundId);
        boundRef.current = boundId;
        const prefsRef = React.useRef(state);
        prefsRef.current = state;

        // Exactly one session drives the pet — the bound one, whether or not it
        // is the conversation on screen. Only that session's own status counts;
        // the pet never reacts to another session's work.
        const boundStatus = useOptional(props.useSessionStatus, (statuses) => {
          const status = boundId ? statuses.get(boundId) : undefined;
          return (status && status.running ? '1' : '0') + '|'
            + (status && status.pendingInteraction ? String(status.pendingInteraction.key) : '');
        }, '0|');
        const statusRef = React.useRef(boundStatus);
        statusRef.current = boundStatus;

        const boundTitle = useOptional(props.useSessions, (state) => {
          const row = boundId ? state.byId[boundId] : undefined;
          return row ? row.displayTitle : null;
        }, null);
        const boundAlive = useOptional(props.useSessions, (state) => !boundId || !!state.byId[boundId], true);

        React.useEffect(() => signal.subscribe((next) => {
          activityRef.current = next;
          const id = next.sessionId || null;
          setVisibleId((current) => (current === id ? current : id));
        }), []);

        // Follow mode: the pet re-homes onto whatever you are looking at.
        React.useEffect(() => {
          if (!state.follow || !visibleId || boundId === visibleId) return;
          setBoundId(visibleId);
          writeBoundSession(visibleId);
        }, [state.follow, visibleId, boundId]);

        // The first conversation the pet ever sees becomes its session.
        React.useEffect(() => {
          if (boundId || !visibleId) return;
          setBoundId(visibleId);
          writeBoundSession(visibleId);
        }, [boundId, visibleId]);

        // Anything the bound session did while it was not the conversation on
        // screen leaves a badge on the pet and on the sidebar button.
        React.useEffect(() => {
          if (stateName !== 'success' && stateName !== 'error' && stateName !== 'waiting') return;
          const focused = activityRef.current;
          const bound = boundRef.current;
          if (!bound) return;
          if (focused.focused && focused.sessionId === bound) return;
          attention.raise(stateName);
        }, [stateName]);

        // Looking at the pet's own session clears the badge.
        React.useEffect(() => {
          if (visibleId && boundId && visibleId === boundId) attention.clear();
        }, [visibleId, boundId]);

        React.useEffect(() => {
          if (!window.matchMedia) return undefined;
          const query = window.matchMedia('(prefers-reduced-motion: reduce)');
          const onChange = () => {
            reducedRef.current = query.matches;
          };
          query.addEventListener('change', onChange);
          return () => query.removeEventListener('change', onChange);
        }, []);

        React.useEffect(() => {
          const onResize = () => setPosition((point) => clampToViewport(point, size));
          window.addEventListener('resize', onResize);
          return () => window.removeEventListener('resize', onResize);
        }, []);

        React.useEffect(() => {
          if (!state.enabled) return undefined;
          const canvas = canvasRef.current;
          if (!canvas) return undefined;
          const ratio = Math.min(window.devicePixelRatio || 1, 3);
          canvas.width = Math.round(petW * ratio);
          canvas.height = Math.round(petH * ratio);

          const sprite = createSprite(canvas);
          if (!sprite) return undefined;
          let frame = 0;
          let painted = '';
          void petW;
          void petH;

          const tick = (time) => {
            const focused = activityRef.current;
            const bound = boundRef.current;
            let activity;
            if (bound && focused.focused && focused.sessionId === bound) {
              activity = Object.assign({}, focused);
            } else {
              const parts = String(statusRef.current || '0|').split('|');
              activity = {
                sessionId: bound,
                running: parts[0] === '1',
                pendingKey: parts[1] || null,
                thinking: false,
                working: false,
                error: null,
              };
            }
            const drag = dragRef.current;
            const pin = drag
              ? {
                state: 'drag',
                frame: dragPose(
                  Math.hypot(drag.lastX - drag.startX, drag.lastY - drag.startY),
                  facingRef.current,
                ),
              }
              : null;
            const resolved = machineRef.current.step(activity, time, prefsRef.current.napSeconds * 1000);
            sprite.paint(resolved, time, reducedRef.current, pin);
            if (resolved.name !== painted) {
              painted = resolved.name;
              setStateName(resolved.name);
            }
            frame = window.requestAnimationFrame(tick);
          };
          frame = window.requestAnimationFrame(tick);
          return () => window.cancelAnimationFrame(frame);
        }, [state.enabled, petW, petH]);

        React.useEffect(() => {
          if (!chatOpen) return undefined;
          const focus = window.setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
          }, 0);
          const onKey = (event) => {
            if (event.key === 'Escape') setChatOpen(false);
          };
          const onDown = (event) => {
            const target = event.target;
            if (bubbleRef.current && bubbleRef.current.contains(target)) return;
            if (chatButtonRef.current && chatButtonRef.current.contains(target)) return;
            if (petRef.current && petRef.current.contains(target)) return;
            setChatOpen(false);
          };
          window.addEventListener('keydown', onKey);
          document.addEventListener('pointerdown', onDown, true);
          return () => {
            window.clearTimeout(focus);
            window.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onDown, true);
          };
        }, [chatOpen]);

        const headPat = React.useCallback(() => {
          machineRef.current.headPat(performance.now());
        }, []);

        const sendHome = React.useCallback(() => {
          setPosition(() => {
            const home = defaultPosition(size);
            writePosition(home);
            return home;
          });
        }, []);

        const bind = React.useCallback((sessionId) => {
          if (!sessionId) return;
          setBoundId(sessionId);
          writeBoundSession(sessionId);
          setNotice(null);
        }, []);

        const submit = React.useCallback(async () => {
          const text = draft.trim();
          if (!text || sending) return;
          if (!boundRef.current) {
            setNotice({ kind: 'error', text: t('chat.unboundHint') });
            return;
          }
          setSending(true);
          setNotice(null);
          try {
            await send(boundRef.current, text);
            setDraft('');
            setChatOpen(false);
          } catch (error) {
            setNotice({ kind: 'error', text: (error && error.message) || t('chat.failed') });
          } finally {
            setSending(false);
          }
        }, [draft, sending, send]);

        const onPointerDown = (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            originX: position.x,
            originY: position.y,
            moved: false,
          };
          setCarrying(true);
          if (event.currentTarget.setPointerCapture) {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch (error) {
              /* capture is an optimisation; dragging works without it */
            }
          }
        };

        const onPointerMove = (event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) < SLOP_PX) return;
          if (!drag.moved) drag.moved = true;
          // The carried pose follows the direction of travel.
          const stepX = event.clientX - drag.lastX;
          drag.lastX = event.clientX;
          drag.lastY = event.clientY;
          if (stepX <= -2) facingRef.current = -1;
          else if (stepX >= 2) facingRef.current = 1;
          setPosition(clampToViewport({ x: drag.originX + dx, y: drag.originY + dy }, size));
        };

        const finishDrag = (event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setCarrying(false);
          if (event.currentTarget.releasePointerCapture) {
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch (error) {
              /* already released */
            }
          }
          if (drag.moved) setPosition((point) => {
            writePosition(point);
            return point;
          });
          else headPat();
        };

        // The carried pose is not a machine state, but the label should say so.
        const label = t('state.' + (carrying ? 'drag' : stateName));
        const bubbleWidth = Math.min(280, Math.max(200, window.innerWidth - 16));
        const bubbleLeft = Math.min(
          Math.max(position.x + petW / 2 - bubbleWidth / 2, 8),
          Math.max(8, window.innerWidth - bubbleWidth - 8),
        );
        const bubbleBelow = position.y < 250;
        const title = boundTitle || (boundId ? t('chat.untitled') : t('chat.unbound'));

        if (!state.enabled) return null;

        return h(React.Fragment, null,
          h('div', {
            key: 'pet',
            ref: petRef,
            className: ROOT_CLASS,
            role: 'button',
            tabIndex: 0,
            'aria-label': t('pet.aria', { state: label }),
            title: label + ' — ' + t('pet.hint'),
            onPointerDown,
            onPointerMove,
            onPointerUp: finishDrag,
            onPointerCancel: finishDrag,
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                headPat();
              }
            },
            onContextMenu: (event) => {
              event.preventDefault();
              sendHome();
            },
            style: {
              position: 'fixed',
              left: position.x + 'px',
              top: position.y + 'px',
              width: petW + 'px',
              height: petH + 'px',
              pointerEvents: 'auto',
              cursor: carrying ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              filter: 'drop-shadow(0 8px 14px rgba(12, 32, 64, 0.28))',
            },
          }, h('canvas', {
            key: 'canvas',
            ref: canvasRef,
            'aria-hidden': true,
            style: { width: petW + 'px', height: petH + 'px', display: 'block' },
          })),
          attentionState.count > 0 ? h('span', {
            key: 'attention',
            'aria-hidden': true,
            style: {
              position: 'fixed',
              left: (position.x + petW - 34) + 'px',
              top: Math.max(4, position.y - 6) + 'px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--dsw-alias-state-warn-primary)',
              boxShadow: '0 0 0 2px var(--dsw-alias-bg-base)',
              pointerEvents: 'none',
            },
          }) : null,

          h('button', {
            key: 'chat-button',
            ref: chatButtonRef,
            type: 'button',
            className: ROOT_CLASS + '-chat',
            'aria-label': t('chat.open'),
            'aria-expanded': chatOpen,
            title: t('chat.open'),
            onClick: () => {
              setChatOpen((open) => !open);
              setNotice(null);
            },
            style: {
              position: 'fixed',
              left: (position.x + petW - 30) + 'px',
              top: Math.max(4, position.y - 8) + 'px',
              width: '26px',
              height: '26px',
              padding: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'auto',
              cursor: 'pointer',
              background: chatOpen
                ? 'var(--dsw-alias-interactive-bg-active)'
                : 'var(--dsw-alias-bg-overlay)',
              color: chatOpen
                ? 'var(--dsw-alias-label-primary)'
                : 'var(--dsw-alias-label-secondary)',
              border: '1px solid var(--dsw-alias-border-l1)',
              boxShadow: '0 2px 8px rgba(12, 32, 64, 0.2)',
            },
          }, h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true },
            h('path', {
              d: 'M2.4 3h11.2a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H7.4L4 14.4v-3H2.4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
              fill: 'currentColor',
            }))),

          chatOpen ? h('div', {
            key: 'bubble',
            ref: bubbleRef,
            role: 'dialog',
            'aria-label': t('chat.open'),
            style: {
              position: 'fixed',
              left: bubbleLeft + 'px',
              width: bubbleWidth + 'px',
              ...(bubbleBelow
                ? { top: (position.y + petH + 12) + 'px' }
                : { bottom: (window.innerHeight - position.y + 12) + 'px' }),
              pointerEvents: 'auto',
              boxSizing: 'border-box',
              font: 'var(--dsw-font-xs-13)',
              color: 'var(--dsw-alias-label-primary)',
              background: 'var(--dsw-alias-bg-overlay)',
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: '14px',
              boxShadow: '0 12px 28px rgba(12, 32, 64, 0.22)',
              padding: '10px 12px',
            },
          },
            h('div', {
              key: 'head',
              style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' },
            },
              h('span', {
                key: 'title',
                style: {
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                },
              }, title),
              !boundAlive ? h('span', {
                key: 'gone',
                style: { color: 'var(--dsw-alias-state-warn-primary)', flex: '0 0 auto' },
              }, t('chat.gone')) : null),

            visibleId && boundId && visibleId !== boundId ? h('button', {
              key: 'follow',
              type: 'button',
              onClick: () => bind(visibleId),
              style: {
                display: 'block',
                width: '100%',
                marginBottom: '8px',
                padding: '5px 8px',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'center',
                color: 'var(--dsw-alias-label-secondary)',
                background: 'var(--dsw-alias-interactive-bg-hover)',
                border: '1px solid var(--dsw-alias-border-l1)',
                font: 'inherit',
              },
            }, t('chat.follow')) : null,

            h('div', { key: 'row', style: { display: 'flex', gap: '6px' } },
              h('input', {
                key: 'input',
                ref: inputRef,
                type: 'text',
                value: draft,
                disabled: sending || !boundId,
                placeholder: boundId ? t('chat.placeholder') : t('chat.unboundHint'),
                'aria-label': t('chat.placeholder'),
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                },
                style: {
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  outline: 'none',
                  font: 'inherit',
                  color: 'var(--dsw-alias-label-primary)',
                  background: 'var(--dsw-alias-bg-layer-1)',
                  border: '1px solid var(--dsw-alias-border-l2)',
                },
              }),
              h('button', {
                key: 'send',
                type: 'button',
                disabled: sending || !boundId || !draft.trim(),
                onClick: submit,
                style: {
                  flex: '0 0 auto',
                  boxSizing: 'border-box',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid transparent',
                  cursor: sending || !boundId || !draft.trim() ? 'default' : 'pointer',
                  opacity: sending || !boundId || !draft.trim() ? 0.55 : 1,
                  color: '#fff',
                  background: 'var(--dsw-alias-button-info-fill)',
                  font: 'inherit',
                  fontWeight: 600,
                },
              }, t('chat.send'))),

            notice ? h('div', {
              key: 'notice',
              style: {
                marginTop: '8px',
                color: notice.kind === 'error'
                  ? 'var(--dsw-alias-state-error-primary)'
                  : 'var(--dsw-alias-label-secondary)',
              },
            }, notice.text) : null,

            h('div', {
              key: 'prefs',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid var(--dsw-alias-border-l1)',
              },
            },
              h('button', {
                key: 'follow',
                type: 'button',
                className: 'dsh-chibi-pet-switch',
                role: 'switch',
                'aria-checked': state.follow,
                'aria-label': t('chat.followMode'),
                title: t('chat.followHint'),
                onClick: () => prefs.set({ follow: !state.follow }),
              }, h('span', { key: 'knob' })),
              h('span', {
                key: 'followLabel',
                style: {
                  flex: 1,
                  minWidth: 0,
                  color: 'var(--dsw-alias-label-secondary)',
                  fontSize: '12px',
                  lineHeight: '16px',
                },
              }, t('chat.followMode')),
              h('select', {
                key: 'size',
                className: 'dsh-chibi-pet-select',
                'aria-label': t('prefs.size'),
                value: state.size,
                onChange: (event) => prefs.set({ size: event.target.value }),
                style: { height: '26px', fontSize: '12px' },
              }, ['small', 'medium', 'large'].map((id) => h('option', {
                key: id,
                value: id,
              }, t('prefs.size.' + id))))),

            h('div', {
              key: 'state',
              style: {
                marginTop: '8px',
                color: 'var(--dsw-alias-label-tertiary)',
                fontSize: '11px',
              },
            }, t('chat.state', { state: label }))) : null);
      }

      /** Human label for one nap choice. */
      function napLabel(seconds) {
        if (seconds === 0) return t('prefs.nap.never');
        return seconds < 60
          ? t('prefs.nap.seconds', { count: seconds })
          : t('prefs.nap.minutes', { count: Math.round(seconds / 60) });
      }

      /**
       * The sidebar-foot switch: the pet's on/off control in the frame chrome.
       * `wide` is false in the 56px rail, where only the glyph fits.
       */
      function PetToggleButton(props) {
        const state = React.useSyncExternalStore(prefs.subscribe, prefs.getSnapshot);
        const attentionState = React.useSyncExternalStore(attention.subscribe, attention.getSnapshot);
        const wide = props.wide !== false;
        const on = state.enabled;
        return h('button', {
          type: 'button',
          className: 'dsh-chibi-pet-toggle',
          role: 'switch',
          'aria-checked': on,
          'aria-label': t('toggle.label') + ' — ' + (on ? t('toggle.on') : t('toggle.off')),
          title: (on ? t('toggle.on') : t('toggle.off')) + ' · ' + t('toggle.hint'),
          onClick: () => prefs.toggle(),
          style: wide ? undefined : { width: '28px', padding: 0 },
        },
          h('span', {
            key: 'glyph',
            style: { display: 'inline-flex', color: 'currentColor', flex: 'none' },
          }, h(PetGlyph, { size: 15 })),
          wide ? h('span', {
            key: 'label',
            className: 'dsh-chibi-pet-label',
            style: { minWidth: 0 },
          }, t('toggle.label')) : null,
          attentionState.count > 0 ? h('span', {
            key: 'dot',
            className: 'dsh-chibi-pet-dot',
            role: 'status',
            'aria-label': t('toggle.attention'),
          }) : null);
      }

      /**
       * One row in Settings → General. The section stacks rows and supplies no
       * props, so the row draws its own label; `row` selects the setting.
       */
      function PetPreferenceRow(props) {
        const state = React.useSyncExternalStore(prefs.subscribe, prefs.getSnapshot);
        const row = props.row || 'toggle';
        let control;
        if (row === 'size') {
          control = h('select', {
            className: 'dsh-chibi-pet-select',
            'aria-label': t('prefs.size'),
            value: state.size,
            disabled: !state.enabled,
            onChange: (event) => prefs.set({ size: event.target.value }),
          }, ['small', 'medium', 'large'].map((id) => h('option', {
            key: id,
            value: id,
          }, t('prefs.size.' + id))));
        } else if (row === 'nap') {
          control = h('select', {
            className: 'dsh-chibi-pet-select',
            'aria-label': t('prefs.nap'),
            value: String(state.napSeconds),
            disabled: !state.enabled,
            onChange: (event) => prefs.set({ napSeconds: Number(event.target.value) }),
          }, NAP_CHOICES.map((seconds) => h('option', {
            key: seconds,
            value: String(seconds),
          }, napLabel(seconds))));
        } else {
          control = h('button', {
            className: 'dsh-chibi-pet-switch',
            type: 'button',
            role: 'switch',
            'aria-checked': state.enabled,
            'aria-label': t('prefs.title'),
            onClick: () => prefs.toggle(),
          }, h('span', { key: 'knob' }));
        }
        const title = row === 'size' ? t('prefs.size') : row === 'nap' ? t('prefs.nap') : t('prefs.title');
        const hint = row === 'size' ? t('prefs.size.hint') : row === 'nap' ? t('prefs.nap.hint') : t('prefs.hint');
        return h('div', { className: 'dsh-chibi-pet-row' },
          h('div', { key: 'text', className: 'dsh-chibi-pet-rowText' },
            h('div', { key: 'title', className: 'dsh-chibi-pet-rowTitle' }, title),
            h('div', { key: 'hint', className: 'dsh-chibi-pet-rowHint' }, hint)),
          control);
      }

      return { PetSensor, PetOverlay, PetToggleButton, PetPreferenceRow };
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        const signal = createSignal();
        const prefs = createPrefs();
        const attention = createAttention();
        migrateStorage();

        ctx.effect(() => {
          const disposeEn = ctx.locale.register(NS, 'en', DICT.en);
          const disposeZh = ctx.locale.register(NS, 'zh', DICT.zh);
          return () => {
            disposeEn();
            disposeZh();
          };
        });

        // One stylesheet for every surface this bundle draws on.
        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-chibi-pet';
          tag.textContent = STYLE;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'dsh-chibi-pet: styles');

        const t = ctx.locale.bind(NS);
        const send = ctx.sessions
          ? createSender(ctx.sessions)
          : async () => {
            throw new Error('sessions service unavailable');
          };
        const { PetSensor, PetOverlay, PetToggleButton, PetPreferenceRow } = createComponents(
          t, signal, send, prefs, attention,
        );

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-pet',
          order: 86,
          label: () => t('pet.label'),
        }, PetOverlay));

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-pet-sensor',
        }, PetSensor));

        // The frame-chrome switch, beside Settings at the sidebar foot.
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-chibi-pet',
          order: 5,
          label: () => t('toggle.label'),
        }, PetToggleButton));

        // Settings → General: on/off, size, nap time.
        for (const [row, order] of [['toggle', 30], ['size', 31], ['nap', 32]]) {
          ctx.slots.inject('settings.general.item', () => ctx.slots.register({
            name: 'settings.general.item',
            id: 'dsh-chibi-pet-' + row,
            order,
            locale: NS,
            inject: () => ({ row }),
          }, PetPreferenceRow));
        }

        // Keyboard command. The web composition admits only a few physical
        // combinations, so this uses one of them; users can rebind it in
        // Settings → Shortcuts like any host command.
        const shortcuts = typeof ctx.get === 'function' ? ctx.get('shortcuts') : undefined;
        if (shortcuts && typeof shortcuts.register === 'function') {
          const binding = { code: 'Period', modifiers: ['primary', 'shift'] };
          ctx.effect(() => shortcuts.register({
            id: 'pet.toggle',
            label: () => t('shortcut.toggle'),
            aliases: [],
            defaults: {
              'web:macos': binding,
              'web:windows': binding,
              'web:linux': binding,
              'desktop:macos': binding,
              'desktop:windows': binding,
              'desktop:linux': binding,
            },
            regions: ['page', 'editable'],
            modals: [],
            resolve() {
              return {
                status: 'handled',
                run: () => {
                  prefs.toggle();
                },
              };
            },
          }), 'dsh-chibi-pet: shortcut');
        }
      },

      /** Test seam: tools/test-machine.mjs drives this fold without a browser. */
      __test: { createMachine, dragPose, STATES, DRAG_POSES, SIZES, NAP_CHOICES, PREF_DEFAULTS },
    };
  },
});
