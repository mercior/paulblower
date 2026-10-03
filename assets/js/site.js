(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Each example is a script of steps played against the hero diagram.
  // go/back move the token along a wire, lit highlights a node, log reveals a line of the trace.
  const SCRIPTS = [
    [
      ['lit', 'chat'], ['log', 0], ['wait', 450],
      ['go', 'chat'], ['think', 700],
      ['go', 'orders'], ['lit', 'orders'], ['log', 1], ['wait', 550],
      ['back', 'orders'], ['think', 450],
      ['go', 'gate'], ['lit', 'gate'], ['log', 2], ['wait', 450],
      ['go', 'answer'], ['lit', 'answer'], ['log', 3],
    ],
    [
      ['lit', 'email'], ['log', 0], ['wait', 450],
      ['go', 'email'], ['think', 700],
      ['go', 'orders'], ['lit', 'orders'], ['log', 1], ['wait', 550],
      ['back', 'orders'], ['think', 350],
      ['go', 'helpdesk'], ['lit', 'helpdesk'], ['log', 2], ['wait', 550],
      ['back', 'helpdesk'], ['think', 450],
      ['go', 'gate'], ['lit', 'gate'], ['log', 3], ['wait', 450],
      ['go', 'team'], ['lit', 'team'], ['log', 4],
    ],
    [
      ['lit', 'slack'], ['log', 0], ['wait', 450],
      ['go', 'slack'], ['think', 700],
      ['go', 'docs'], ['lit', 'docs'], ['log', 1], ['wait', 650],
      ['back', 'docs'], ['think', 450],
      ['go', 'gate'], ['lit', 'gate'], ['log', 2], ['wait', 450],
      ['go', 'answer'], ['lit', 'answer'], ['log', 3],
    ],
  ];

  const SPEED = 0.2;
  const MIN_TRAVEL = 360;
  const HOLD = 2600;
  const FADE = 600;
  const DRAW_IN = 2100;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  initCopyButtons();
  initSystemDiagram();

  function initCopyButtons() {
    const buttons = document.querySelectorAll('[data-copy]');
    if (!navigator.clipboard) {
      buttons.forEach((button) => { button.hidden = true; });
      return;
    }

    const status = document.querySelector('[data-copy-status]');
    buttons.forEach((button) => {
      const label = button.textContent;
      let timer = 0;
      button.addEventListener('click', async () => {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = 'Copied';
        button.classList.add('is-done');
        status.textContent = 'Email address copied';
        clearTimeout(timer);
        timer = setTimeout(() => {
          button.textContent = label;
          button.classList.remove('is-done');
          status.textContent = '';
        }, 2000);
      });
    });
  }

  function initSystemDiagram() {
    const figure = document.querySelector('[data-system]');
    const svg = figure.querySelector('.system-svg');
    const traceLayer = svg.querySelector('.trace');
    const token = svg.querySelector('.token');
    const chips = [...figure.querySelectorAll('[data-scenario]')];
    const logs = [...figure.querySelectorAll('[data-log]')];
    const pauseButton = figure.querySelector('[data-pause]');
    const pauseLabel = figure.querySelector('[data-pause-label]');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    const wires = {};
    svg.querySelectorAll('[data-wire]').forEach((path) => {
      const length = path.getTotalLength();
      const trace = document.createElementNS(SVG_NS, 'path');
      trace.setAttribute('d', path.getAttribute('d'));
      trace.setAttribute('class', 'trace-path');
      trace.style.strokeDasharray = `${length} ${length}`;
      trace.style.strokeDashoffset = length;
      trace.style.opacity = 0;
      traceLayer.append(trace);
      wires[path.dataset.wire] = { path, trace, length, shown: 0 };
    });

    const nodes = {};
    svg.querySelectorAll('[data-node]').forEach((node) => { nodes[node.dataset.node] = node; });

    const plans = SCRIPTS.map(compile);

    let current = 0;
    let clock = 0;
    let lastFrame = 0;
    let frame = 0;
    let started = false;
    let userPaused = false;
    let inView = true;
    let pageVisible = !document.hidden;

    function compile(script) {
      const plan = { travels: [], lit: [], logs: [], thinks: [], done: 0, end: 0 };
      let t = 0;
      script.forEach(([kind, arg]) => {
        if (kind === 'wait') {
          t += arg;
        } else if (kind === 'lit') {
          plan.lit.push({ node: arg, at: t });
        } else if (kind === 'log') {
          plan.logs.push({ index: arg, at: t });
        } else if (kind === 'think') {
          plan.thinks.push({ from: t, to: t + arg });
          t += arg;
        } else {
          const duration = Math.max(MIN_TRAVEL, wires[arg].length / SPEED);
          plan.travels.push({ wire: arg, from: t, to: t + duration, back: kind === 'back' });
          t += duration;
        }
      });
      plan.done = t;
      plan.end = t + HOLD + FADE;
      return plan;
    }

    function render(index, t) {
      const plan = plans[index];
      const settled = t >= plan.done + HOLD;
      const fade = clamp01((t - plan.done - HOLD) / FADE);

      Object.values(wires).forEach((wire) => { wire.target = 0; });
      let point = null;
      plan.travels.forEach((travel) => {
        const wire = wires[travel.wire];
        const p = easeInOut(clamp01((t - travel.from) / (travel.to - travel.from)));
        if (!travel.back) wire.target = Math.max(wire.target, p);
        if (t >= travel.from && t < travel.to) {
          point = wire.path.getPointAtLength((travel.back ? 1 - p : p) * wire.length);
        }
      });

      Object.values(wires).forEach((wire) => {
        if (wire.target === wire.shown) return;
        wire.shown = wire.target;
        wire.trace.style.strokeDashoffset = wire.length * (1 - wire.shown);
        wire.trace.style.opacity = wire.shown > 0 ? 1 : 0;
      });
      traceLayer.style.opacity = 1 - fade;

      token.classList.toggle('is-on', point !== null);
      if (point) token.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);

      Object.entries(nodes).forEach(([name, node]) => {
        const lit = !settled && plan.lit.some((entry) => entry.node === name && t >= entry.at);
        node.classList.toggle('is-lit', lit);
      });
      nodes.agent.classList.toggle('is-thinking', plan.thinks.some((span) => t >= span.from && t < span.to));

      const lines = logs[index].children;
      plan.logs.forEach((entry) => lines[entry.index].classList.toggle('is-shown', t >= entry.at));
      logs[index].style.opacity = 1 - fade;
    }

    function select(index, t) {
      current = index;
      clock = t;
      chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(i === index)));
      logs.forEach((log, i) => {
        log.classList.toggle('is-active', i === index);
        log.style.opacity = '';
        if (i !== index) [...log.children].forEach((line) => line.classList.remove('is-shown'));
      });
      render(index, t);
    }

    function tick(now) {
      clock += Math.min(64, now - lastFrame);
      lastFrame = now;
      if (clock >= plans[current].end) {
        select((current + 1) % plans.length, 0);
      } else {
        render(current, clock);
      }
      frame = requestAnimationFrame(tick);
    }

    function shouldRun() {
      return started && !userPaused && inView && pageVisible && !reducedMotion.matches;
    }

    function sync() {
      if (shouldRun() && !frame) {
        lastFrame = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!shouldRun() && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    function showStill(index) {
      select(index, plans[index].done);
    }

    chips.forEach((chip, i) => {
      chip.addEventListener('click', () => {
        if (userPaused || reducedMotion.matches) showStill(i);
        else select(i, 0);
        started = true;
        sync();
      });
    });

    pauseButton.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseButton.setAttribute('aria-pressed', String(userPaused));
      pauseLabel.textContent = userPaused ? 'Play animation' : 'Pause animation';
      sync();
    });

    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { threshold: 0.1 }).observe(figure);

    document.addEventListener('visibilitychange', () => {
      pageVisible = !document.hidden;
      sync();
    });

    reducedMotion.addEventListener('change', () => {
      figure.classList.toggle('is-reduced', reducedMotion.matches);
      if (reducedMotion.matches) showStill(current);
      started = true;
      sync();
    });

    if (reducedMotion.matches) {
      figure.classList.add('is-reduced');
      started = true;
      showStill(0);
    } else {
      setTimeout(() => {
        if (started) return;
        started = true;
        select(0, 0);
        sync();
      }, DRAW_IN);
    }
  }
})();
