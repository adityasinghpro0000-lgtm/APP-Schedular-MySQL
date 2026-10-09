'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const PALETTE = ['#506db0','#d9795f','#5d906e','#9a7ab4','#c18d4b','#608d98','#b05076','#7ab450','#a06050','#5090b0'];

const DEFAULT_PROCESSES = [
  { id:'P1', arrival:0, burst:5, priority:2, deadline:10, color:'#506db0', state:'Ready' },
  { id:'P2', arrival:1, burst:3, priority:1, deadline:7,  color:'#d9795f', state:'Ready' },
  { id:'P3', arrival:2, burst:8, priority:3, deadline:20, color:'#5d906e', state:'Ready' },
  { id:'P4', arrival:3, burst:2, priority:2, deadline:8,  color:'#9a7ab4', state:'Ready' },
  { id:'P5', arrival:4, burst:4, priority:1, deadline:15, color:'#c18d4b', state:'Ready' },
];

const ALGO_META = {
  fcfs:        { name:'FCFS',          fullName:'First Come, First Served',                  type:'NON-PREEMPTIVE', formula:'min(arrival time)',        desc:'Processes execute in arrival order. Simple and predictable but long processes block shorter ones — the convoy effect.' },
  sjf:         { name:'SJF',           fullName:'Shortest Job First',                        type:'NON-PREEMPTIVE', formula:'min(burst time)',           desc:'The process with the shortest total burst runs next. Minimises average waiting time but may indefinitely starve long processes.' },
  srtf:        { name:'SRTF',          fullName:'Shortest Remaining Time First',             type:'PREEMPTIVE',     formula:'min(remaining time)',      desc:'Preemptive SJF. If a new arrival has less remaining time than the current process, it preempts immediately. Optimal average WT.' },
  rr:          { name:'Round Robin',   fullName:'Round Robin',                               type:'PREEMPTIVE',     formula:'circular queue × Q',      desc:'Each process receives a fixed time quantum Q in a circular order. Fair and starvation-free. Performance is sensitive to Q size.' },
  priority_np: { name:'Priority (NP)', fullName:'Priority Scheduling (Non-Preemptive)',      type:'NON-PREEMPTIVE', formula:'max priority value',       desc:'Highest-priority available process runs until it finishes. Lower-priority processes may starve without aging.' },
  priority_p:  { name:'Priority (P)',  fullName:'Priority Scheduling (Preemptive)',          type:'PREEMPTIVE',     formula:'max priority value',       desc:'If a newly arrived process has higher priority than the running one, it immediately preempts it. Very responsive to high-priority tasks.' },
  mlfq:        { name:'MLFQ',          fullName:'Multi-Level Feedback Queue',                type:'PREEMPTIVE',     formula:'highest non-empty queue',  desc:'Processes start in Q0 (short quantum) and are demoted if they use their full quantum. Anti-starvation aging periodically boosts waiting processes.' },
  edf:         { name:'EDF',           fullName:'Earliest Deadline First',                   type:'PREEMPTIVE',     formula:'min(deadline − clock)',    desc:'Real-time scheduling. Always runs the process with the nearest absolute deadline. Theoretically optimal for meeting all deadlines on a single CPU.' },
  cfs:         { name:'CFS',           fullName:'Completely Fair Scheduler (Linux)',         type:'PREEMPTIVE',     formula:'min(vruntime)',            desc:'Tracks virtual runtime (vruntime) per process and always schedules the one with the least accumulated CPU time. Mimics Linux\'s production scheduler.' },
};

// ============================================================
// STATE
// ============================================================
let processes   = DEFAULT_PROCESSES.map(p => ({ ...p }));
let lastResult  = null;
let allSnaps    = [];
let snapIdx     = 0;
let playTimer   = null;
let compData    = null;
const WSKEY_BASE = 'cpu-sim-ws-v3';

function workspaceStorageKey() {
  if (new URLSearchParams(window.location.search).get('demo') === '1') return `${WSKEY_BASE}-demo`;
  const profileId = window.ProfileManager?.getStorageScope?.() || 'default';
  const workspaceId = localStorage.getItem(`cpu-simulator-active-workspace-${profileId}`) || 'welcome';
  return `${WSKEY_BASE}-${profileId}-${workspaceId}`;
}

// ============================================================
// DOM
// ============================================================
const $  = id => document.getElementById(id);
const algoSel  = $('algorithm');
const quantumIn = $('quantum');
const csIn      = $('contextSwitch');
const priConvIn = $('priorityConvention');
const presetSel = $('preset');
const themeBtn  = $('themeToggle');
const motionBtn = $('motionToggle');

// ============================================================
// UTILITIES
// ============================================================
function getColor(pid) {
  const p = processes.find(x => x.id === pid);
  if (p?.color) return p.color;
  const i = processes.findIndex(x => x.id === pid);
  return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
}
function stateClass(s) {
  s = String(s || '').toLowerCase();
  if (s.includes('run'))                                    return 'running';
  if (s.includes('terminat') || s.includes('complet'))     return 'completed';
  if (s.includes('wait') || s.includes('block'))           return 'waiting';
  return 'ready';
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Stochastic helpers (pure JS)
function poissonSample(lam) {
  if (lam <= 0) return 0;
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return Math.max(0, k - 1);
}
function exponentialSample(rate) {
  return rate > 0 ? -Math.log(Math.random()) / rate : 0;
}

// ============================================================
// SIMULATION ENGINE  (tick-by-tick, all 9 algorithms)
// ============================================================
function simulate(procs, algo, opts = {}) {
  const Q      = Math.max(1, opts.Q  || 2);
  const CS     = Math.max(0, opts.CS || 0);
  const priMul = opts.priDir === 'higher' ? -1 : 1;   // lower number = higher priority by default
  const mlfqQ  = opts.mlfqQ || [2, 4, 8];             // quanta per MLFQ level

  // ── PCB initialisation ──────────────────────────────────
  const pcbs = procs.map(p => ({
    ...p,
    remaining:      p.burst,
    state:          p.arrival <= 0 ? 'Ready' : 'New',
    responseTime:   null,
    completionTime: null,
    turnaroundTime: null,
    waitingTime:    null,
    vruntime:       0,
    queueLevel:     0,
    quantumUsed:    0,
    ageCounter:     0,
  }));

  // FIFO queues for RR / MLFQ  (other algos use readyPool())
  const fifoQ = mlfqQ.map(() => []);

  // ── Helpers ─────────────────────────────────────────────
  const readyPool   = () => pcbs.filter(p => p.state === 'Ready');
  const allDone     = () => pcbs.every(p => p.state === 'Terminated');

  function arrive() {
    pcbs.filter(p => p.state === 'New' && p.arrival <= clock).forEach(p => {
      p.state = 'Ready';
      fifoQ[p.queueLevel || 0].push(p);
    });
  }

  function dequeue(pcb) {
    for (const q of fifoQ) { const i = q.indexOf(pcb); if (i >= 0) { q.splice(i, 1); return; } }
  }

  function enqueue(pcb) {
    pcb.state = 'Ready';
    fifoQ[pcb.queueLevel || 0].push(pcb);
  }

  function pick() {
    const pool = readyPool();
    if (!pool.length) return null;
    switch (algo) {
      case 'fcfs':        return pool.reduce((b,p) => p.arrival < b.arrival ? p : b);
      case 'sjf':         return pool.reduce((b,p) => p.burst     < b.burst     ? p : b);
      case 'srtf':        return pool.reduce((b,p) => p.remaining < b.remaining ? p : b);
      case 'rr':          return fifoQ[0][0] || null;
      case 'priority_np': return pool.reduce((b,p) => p.priority * priMul < b.priority * priMul ? p : b);
      case 'priority_p':  return pool.reduce((b,p) => p.priority * priMul < b.priority * priMul ? p : b);
      case 'mlfq':      { for (const q of fifoQ) if (q.length) return q[0]; return null; }
      case 'edf':         return pool.reduce((b,p) => (p.deadline ?? Infinity) < (b.deadline ?? Infinity) ? p : b);
      case 'cfs':         return pool.reduce((b,p) => p.vruntime < b.vruntime ? p : b);
      default:            return pool[0];
    }
  }

  function shouldPreempt() {
    if (!current) return false;
    const pool = readyPool();
    if (!pool.length) return false;
    switch (algo) {
      case 'fcfs': case 'sjf': case 'priority_np': return false;
      case 'rr':          return current.quantumUsed >= Q;
      case 'srtf':        return pool.some(p => p.remaining < current.remaining);
      case 'priority_p':  return pool.some(p => p.priority * priMul < current.priority * priMul);
      case 'mlfq': {
        for (let q = 0; q < current.queueLevel; q++) if (fifoQ[q].length) return true;
        return current.quantumUsed >= mlfqQ[current.queueLevel];
      }
      case 'edf':  return pool.some(p => (p.deadline ?? Infinity) < (current.deadline ?? Infinity));
      case 'cfs':  return pool.some(p => p.vruntime < current.vruntime);
      default:     return false;
    }
  }

  // ── Gantt helpers ────────────────────────────────────────
  const gantt = [];
  function addGanttTick(id, type) {
    const last = gantt[gantt.length - 1];
    if (last && last.id === id && last.type === type && last.end === clock) {
      last.end = clock + 1;
    } else {
      gantt.push({ id, type, start: clock, end: clock + 1 });
    }
  }

  // ── Snapshot helper ──────────────────────────────────────
  const snapshots = [];
  function takeSnap(runId) {
    const pool  = readyPool();
    const rq = algo === 'mlfq'
      ? fifoQ.flatMap((q, i) => q.map(p => ({ id: p.id, remaining: p.remaining, priority: p.priority, queueLevel: i })))
      : pool.map(p => ({ id: p.id, remaining: p.remaining, priority: p.priority }));
    snapshots.push({
      clock,
      running:      runId || null,
      readyQueue:   rq,
      processStates: new Map(pcbs.map(p => [p.id, p.state])),
    });
  }

  // ── MLFQ anti-starvation aging ───────────────────────────
  function ageMlfq() {
    for (let qi = 1; qi < fifoQ.length; qi++) {
      fifoQ[qi].forEach(p => {
        p.ageCounter++;
        if (p.ageCounter >= 20) {
          dequeue(p);
          p.queueLevel = Math.max(0, p.queueLevel - 1);
          p.ageCounter = 0;
          enqueue(p);
        }
      });
    }
  }

  // ── Pre-populate t=0 arrivals ────────────────────────────
  pcbs.filter(p => p.arrival === 0).forEach(p => {
    p.state = 'Ready';
    fifoQ[0].push(p);
  });

  // ── Main loop ────────────────────────────────────────────
  let clock   = 0;
  let current = null;
  let prevId  = null;
  let csLeft  = 0;
  const MAXCLOCK = procs.reduce((s, p) => s + p.burst, 0) * 5 + 100;

  while (clock < MAXCLOCK) {
    if (allDone()) break;

    arrive();

    // ── Context-switch drain ──────────────────────────────
    if (csLeft > 0) {
      csLeft--;
      addGanttTick('CS', 'cs');
      takeSnap(null);
      clock++;
      continue;
    }

    // ── Preemption check ─────────────────────────────────
    if (current && shouldPreempt()) {
      current.state = 'Ready';
      if (algo === 'rr') {
        current.quantumUsed = 0;
        enqueue(current);
      } else if (algo === 'mlfq') {
        if (current.quantumUsed >= mlfqQ[current.queueLevel]) {
          current.queueLevel = Math.min(current.queueLevel + 1, fifoQ.length - 1);
          current.quantumUsed = 0;
        }
        enqueue(current);
      }
      // For SRTF / priority_p / EDF / CFS the process just becomes Ready again
      // (readyPool() will include it on next pick())
      const oldId = current.id;
      current = null;
      if (CS > 0 && prevId !== null) {
        csLeft = CS;
        addGanttTick('CS', 'cs');
        takeSnap(null);
        clock++;
        continue;
      }
    }

    // ── Pick next ─────────────────────────────────────────
    if (!current) {
      const cand = pick();
      if (!cand) {
        addGanttTick('IDLE', 'idle');
        takeSnap(null);
        clock++;
        continue;
      }
      // Context switch on process change
      if (CS > 0 && prevId && prevId !== cand.id) {
        csLeft = CS;
        addGanttTick('CS', 'cs');
        takeSnap(null);
        clock++;
        continue;
      }
      current = cand;
      dequeue(current);
      current.state     = 'Running';
      if (current.responseTime === null) current.responseTime = clock - current.arrival;
      // quantumUsed: keep for MLFQ demotion tracking; reset for RR
    }

    // ── Execute 1 tick ────────────────────────────────────
    prevId = current.id;
    current.remaining--;
    current.quantumUsed++;
    current.vruntime++;

    addGanttTick(current.id, 'cpu');
    if (algo === 'mlfq') ageMlfq();

    // Completion check
    let ranId = current.id;
    if (current.remaining <= 0) {
      current.state          = 'Terminated';
      current.completionTime = clock + 1;
      current.turnaroundTime = current.completionTime - current.arrival;
      current.waitingTime    = current.turnaroundTime - current.burst;
      current = null;
      prevId  = null;
    }

    takeSnap(ranId);
    clock++;
  }

  return { gantt, snapshots, pcbs };
}

// ============================================================
// METRICS
// ============================================================
function calcMetrics(pcbs) {
  const done = pcbs.filter(p => p.state === 'Terminated');
  if (!done.length) return null;
  const totalBurst = pcbs.reduce((s, p) => s + p.burst, 0);
  const makespan   = Math.max(...done.map(p => p.completionTime));
  return {
    avgWT:        done.reduce((s, p) => s + p.waitingTime,    0) / done.length,
    avgTAT:       done.reduce((s, p) => s + p.turnaroundTime, 0) / done.length,
    avgRT:        done.reduce((s, p) => s + (p.responseTime ?? 0), 0) / done.length,
    utilization:  makespan ? (totalBurst / makespan) * 100 : 0,
    throughput:   makespan ? done.length / makespan : 0,
    makespan,
  };
}

// ============================================================
// RENDER — process table
// ============================================================
function renderTable() {
  const tbody    = $('processTable');
  const showDL   = algoSel.value === 'edf';
  tbody.innerHTML = processes.map((p, i) => `
    <tr>
      <td><input class="process-color-input" type="color" value="${p.color || PALETTE[i % PALETTE.length]}" data-index="${i}" data-field="color" aria-label="${p.id} color"></td>
      <td><input class="process-input process-name" type="text"   value="${p.id}"      data-index="${i}" data-field="id"       aria-label="${p.id} name"></td>
      <td><input class="process-input"             type="number" value="${p.arrival}"  data-index="${i}" data-field="arrival"  min="0"  aria-label="${p.id} arrival"></td>
      <td><input class="process-input"             type="number" value="${p.burst}"    data-index="${i}" data-field="burst"    min="1"  aria-label="${p.id} burst"></td>
      <td><input class="process-input"             type="number" value="${p.priority}" data-index="${i}" data-field="priority" min="1"  aria-label="${p.id} priority"></td>
      <td class="deadline-col${showDL ? '' : ' hidden'}"><input class="process-input" type="number" value="${p.deadline || ''}" data-index="${i}" data-field="deadline" min="1" placeholder="—" aria-label="${p.id} deadline"></td>
      <td><span class="state-pill ${stateClass(p.state)}">${p.state || 'Ready'}</span></td>
      <td><button class="delete-button" data-remove="${i}" aria-label="Remove ${p.id}"><i data-lucide="trash-2"></i></button></td>
    </tr>`).join('');
  document.querySelectorAll('.deadline-header').forEach(h => h.classList.toggle('hidden', !showDL));
  $('processCount').textContent  = `${processes.length} process${processes.length === 1 ? '' : 'es'}`;
  $('workloadTotal').textContent = `${processes.reduce((s, p) => s + p.burst, 0)} units`;
  lucide.createIcons();
}

// ============================================================
// RENDER — Gantt chart
// ============================================================
function renderGantt(gantt, hlClock = null) {
  const tl  = $('timeline');
  const ax  = $('timelineAxis');
  if (!gantt?.length) { tl.innerHTML = ''; ax.innerHTML = ''; return; }
  const total = Math.max(...gantt.map(b => b.end));

  tl.innerHTML = gantt.map(b => {
    const dur   = b.end - b.start;
    const idle  = b.type === 'idle';
    const cs    = b.type === 'cs';
    const col   = idle || cs ? '' : getColor(b.id);
    const hl    = hlClock !== null && hlClock >= b.start && hlClock < b.end ? ' hl' : '';
    return `<div class="timeline-block${idle ? ' idle' : ''}${cs ? ' cs-block' : ''}${hl}"
      style="flex:${dur} 1 0${col ? ';background:' + col : ''}"
      title="${b.id}: t${b.start}→t${b.end} (${dur}u)">
      <span>${b.id}</span><small>${dur}u</small>
    </div>`;
  }).join('');

  const ticks = new Set([0]);
  gantt.forEach(b => { ticks.add(b.start); ticks.add(b.end); });
  const sorted = [...ticks].sort((a, b) => a - b);
  ax.innerHTML = sorted.map(t => `<span style="left:${(t / total) * 100}%">${t}</span>`).join('');
  $('totalTime').textContent = `${total} units`;
}

// ============================================================
// RENDER — ready queue / state monitor
// ============================================================
function renderMonitor(snap) {
  const clkEl = $('simClock');
  const runEl = $('runningProcess');
  const mon   = $('readyQueueMonitor');
  if (clkEl) clkEl.textContent = snap ? `t = ${snap.clock}` : 't = —';

  if (runEl) {
    if (snap?.running) {
      const col = getColor(snap.running);
      runEl.innerHTML = `<div class="queue-chip run-chip" style="background:${col};border-color:${col}">
        <span class="chip-id" style="color:#fff">${snap.running}</span>
        <span class="chip-meta">RUNNING</span></div>`;
    } else {
      runEl.innerHTML = '<span class="queue-empty">— idle —</span>';
    }
  }

  if (!mon) return;

  const stateGroups = {
    Ready: [],
    Waiting: [],
    Terminated: [],
  };

  if (snap?.processStates) {
    for (const [pid, state] of snap.processStates.entries()) {
      const label = String(state || 'Ready');
      if (stateGroups[label]) stateGroups[label].push(pid);
      else if (label === 'New') stateGroups.Ready.push(pid);
    }
  } else if (snap?.readyQueue) {
    stateGroups.Ready = snap.readyQueue.map(p => p.id);
  }

  const groupMarkup = Object.entries(stateGroups)
    .filter(([, ids]) => ids.length)
    .map(([state, ids]) => {
      const chips = ids.map(pid => {
        const col = getColor(pid);
        const meta = state === 'Terminated' ? 'DONE' : state === 'Waiting' ? 'WAITING' : 'READY';
        return `<div class="queue-chip" style="border-color:${col}"><span class="chip-id" style="color:${col}">${pid}</span><span class="chip-meta">${meta}</span></div>`;
      }).join('');
      return `<div class="queue-state-group"><div class="queue-state-label">${state}</div><div class="queue-state-items">${chips}</div></div>`;
    })
    .join('');

  mon.innerHTML = groupMarkup || '<span class="queue-empty">Queue empty</span>';
}

// ============================================================
// RENDER — summary metrics cards
// ============================================================
function renderMetrics(m) {
  if (!m) return;
  const values = {
    avgWaiting: `${m.avgWT.toFixed(2)} <small>units</small>`,
    avgTurnaround: `${m.avgTAT.toFixed(2)} <small>units</small>`,
    avgResponse: `${m.avgRT.toFixed(2)} <small>units</small>`,
    utilization: `${m.utilization.toFixed(1)}<small>%</small>`,
    throughput: `${m.throughput.toFixed(3)} <small>p/u</small>`,
  };
  Object.entries(values).forEach(([id, value]) => { const element = $(id); if (element) element.innerHTML = value; });
  const trend = $('waitingTrend');
  if (trend) trend.textContent = m.avgWT <= 3 ? 'Efficient queue time' : 'Queue time to optimise';
}

// ============================================================
// RENDER — per-process metrics table
// ============================================================
function renderProcessMetrics(pcbs) {
  const tbody = $('processMetricsBody');
  if (!tbody || !pcbs) return;
  tbody.innerHTML = pcbs.map(p => {
    const col = p.color || getColor(p.id);
    const ct  = p.completionTime  ?? '—';
    const tat = p.turnaroundTime  ?? '—';
    const wt  = p.waitingTime     ?? '—';
    const rt  = p.responseTime    ?? '—';
    const dlOk = !p.deadline || !p.completionTime || p.completionTime <= p.deadline;
    const dlStr = p.deadline
      ? (dlOk ? p.deadline : `<span class="missed-dl">${p.deadline} ✗</span>`)
      : '—';
    return `<tr>
      <td><span class="proc-dot" style="background:${col}"></span>${p.id}</td>
      <td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td>
      <td class="mono-num">${ct}</td>
      <td class="mono-num">${tat}</td>
      <td class="mono-num">${wt}</td>
      <td class="mono-num">${rt}</td>
      <td>${dlStr}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// RENDER — algorithm info card
// ============================================================
function renderAlgoNote() {
  const alg  = algoSel.value;
  const meta = ALGO_META[alg] || ALGO_META.fcfs;
  const tagEl = $('algorithmTag') || document.querySelector('.info-panel .tag');

  $('algorithmTitle').textContent       = meta.name;
  if (tagEl) {
    tagEl.textContent = meta.type;
    tagEl.className = `tag ${meta.type === 'PREEMPTIVE' ? 'tag-pre' : 'tag-np'}`;
  }
  $('algorithmDescription').textContent = meta.desc;
  $('formulaText').textContent          = meta.formula;
  document.querySelector('.quantum-control')?.classList.toggle('hidden', !['rr','mlfq'].includes(alg));
  $('mlfqConfig')?.classList.toggle('hidden', alg !== 'mlfq');
  document.querySelector('.priority-control')?.classList.toggle('hidden', !alg.startsWith('priority') && alg !== 'mlfq');
  document.querySelectorAll('.deadline-col,.deadline-header').forEach(el => el.classList.toggle('hidden', alg !== 'edf'));
}

// ============================================================
// COMPARISON MODE
// ============================================================
function runComparison() {
  const opts = getOpts();
  compData = {};
  for (const alg of Object.keys(ALGO_META)) {
    try {
      const { pcbs } = simulate(processes, alg, opts);
      const m = calcMetrics(pcbs);
      if (m) compData[alg] = { ...m, algo: alg };
    } catch (e) { console.warn(alg, e); }
  }
  renderComparison();
}

function renderComparison() {
  const panel = $('comparisonPanel');
  if (!panel || !compData) return;
  const algs = Object.keys(compData);
  if (!algs.length) return;

  const bestWT   = Math.min(...algs.map(a => compData[a].avgWT));
  const bestTAT  = Math.min(...algs.map(a => compData[a].avgTAT));
  const bestRT   = Math.min(...algs.map(a => compData[a].avgRT));
  const bestUtil = Math.max(...algs.map(a => compData[a].utilization));
  const maxWT    = Math.max(...algs.map(a => compData[a].avgWT)) || 1;

  panel.innerHTML = `
    <div class="cmp-table-wrap">
      <table class="cmp-table">
        <thead><tr><th>Algorithm</th><th>Mode</th><th>Avg WT ↓</th><th>Avg TAT ↓</th><th>Avg RT ↓</th><th>CPU Util ↑</th><th>Throughput</th></tr></thead>
        <tbody>${algs.map(a => {
          const r    = compData[a];
          const meta = ALGO_META[a];
          const cur  = a === algoSel.value;
          return `<tr class="${cur ? 'cmp-current' : ''}">
            <td><strong>${meta.name}</strong>${cur ? ' <span class="cmp-badge">current</span>' : ''}</td>
            <td><span class="cmp-type ${meta.type === 'PREEMPTIVE' ? 'pre' : 'np'}">${meta.type}</span></td>
            <td class="${r.avgWT        <= bestWT   + .01 ? 'cmp-best' : ''}">${r.avgWT.toFixed(2)}</td>
            <td class="${r.avgTAT       <= bestTAT  + .01 ? 'cmp-best' : ''}">${r.avgTAT.toFixed(2)}</td>
            <td class="${r.avgRT        <= bestRT   + .01 ? 'cmp-best' : ''}">${r.avgRT.toFixed(2)}</td>
            <td class="${r.utilization  >= bestUtil - .1  ? 'cmp-best' : ''}">${r.utilization.toFixed(1)}%</td>
            <td>${r.throughput.toFixed(3)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <div class="cmp-bars-section">
      <p class="cmp-bars-title">Average Waiting Time (lower = better)</p>
      ${algs.map(a => {
        const r   = compData[a];
        const pct = Math.round((r.avgWT / maxWT) * 100);
        const cur = a === algoSel.value;
        return `<div class="cmp-bar-row">
          <span class="cmp-bar-name">${ALGO_META[a].name}</span>
          <div class="cmp-bar-track">
            <div class="cmp-bar-fill${r.avgWT <= bestWT + .01 ? ' best' : ''}${cur ? ' current' : ''}" style="width:${Math.max(pct, 2)}%"></div>
          </div>
          <span class="cmp-bar-val">${r.avgWT.toFixed(2)}</span>
        </div>`;
      }).join('')}
    </div>`;
}

// ============================================================
// EXPORT — CSV / JSON
// ============================================================
function dlBlob(content, name, type) {
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCSV() {
  if (!lastResult) return;
  const hdr  = 'PID,Arrival,Burst,Priority,Deadline,CT,TAT,WT,RT';
  const rows = lastResult.pcbs.map(p =>
    [p.id, p.arrival, p.burst, p.priority, p.deadline || '', p.completionTime || '',
     p.turnaroundTime || '', p.waitingTime || '', p.responseTime ?? ''].join(','));
  dlBlob([hdr, ...rows].join('\n'), 'cpu-simulation.csv', 'text/csv');
  addLog('Exported CSV');
}

function exportJSON() {
  if (!lastResult) return;
  dlBlob(JSON.stringify({
    algorithm:  algoSel.value,
    algoName:   ALGO_META[algoSel.value]?.fullName,
    processes:  lastResult.pcbs,
    metrics:    lastResult.metrics,
    gantt:      lastResult.gantt,
    timestamp:  new Date().toISOString(),
  }, null, 2), 'cpu-simulation.json', 'application/json');
  addLog('Exported JSON');
}

// ============================================================
// WORKLOAD GENERATOR — pure JS stochastic distributions
// ============================================================
function generateWorkload(n, dist, lam, maxBurst) {
  let clock = 0;
  return Array.from({ length: n }, (_, i) => {
    let gap;
    if      (dist === 'poisson')     gap = poissonSample(lam);
    else if (dist === 'exponential') gap = Math.round(exponentialSample(1 / Math.max(lam, .1)));
    else                             gap = Math.floor(Math.random() * Math.max(1, Math.round(lam)));
    clock += gap;

    let burst;
    if      (dist === 'poisson')     burst = Math.max(1, Math.min(maxBurst, poissonSample(lam * 2)));
    else if (dist === 'exponential') burst = Math.max(1, Math.min(maxBurst, Math.round(exponentialSample(1 / (maxBurst / 2)))));
    else                             burst = Math.ceil(Math.random() * maxBurst);

    return {
      id:       `P${i + 1}`,
      arrival:  clock,
      burst,
      priority: Math.ceil(Math.random() * 5),
      deadline: clock + burst + Math.ceil(Math.random() * 10) + 2,
      color:    PALETTE[i % PALETTE.length],
      state:    'Ready',
    };
  });
}

function normalizeImportedProcesses(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('No processes found');
  const seen = new Set();
  return items.map((item, index) => {
    const id = String(item.id ?? item.PID ?? `P${index + 1}`).trim();
    const arrival = Number(item.arrival ?? item.AT ?? 0);
    const burst = Number(item.burst ?? item.BT ?? 0);
    const priority = Number(item.priority ?? item.Priority ?? 1);
    if (!id || seen.has(id) || !Number.isFinite(arrival) || arrival < 0 || !Number.isFinite(burst) || burst < 1) throw new Error(`Invalid process at row ${index + 1}`);
    seen.add(id);
    return { id, arrival, burst, priority: Number.isFinite(priority) ? priority : 1, deadline: Number(item.deadline ?? item.Deadline ?? 0) || arrival + burst + 10, color: PALETTE[index % PALETTE.length], state: 'Ready' };
  });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV needs a header and at least one process');
  const headers = lines.shift().split(',').map(value => value.trim());
  return lines.map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim()]));
  });
}

async function importWorkload(file) {
  const text = await file.text();
  const data = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text);
  processes = normalizeImportedProcesses(Array.isArray(data) ? data : data.processes);
  addLog(`Imported ${processes.length} processes`);
  renderTable(); runSim(); updateNavCount();
}

// ============================================================
// SIMULATION RUN
// ============================================================
function getOpts() {
  const mlfqInputs = [...document.querySelectorAll('.mlfq-q-val')];
  return {
    Q:      Math.max(1, Number(quantumIn.value) || 2),
    CS:     Math.max(0, Number(csIn.value)      || 0),
    priDir: priConvIn.value || 'lower',
    mlfqQ:  mlfqInputs.length ? mlfqInputs.map(el => Math.max(1, Number(el.value) || 2)) : [2, 4, 8],
  };
}

function runSim() {
  pause();
  const opts = getOpts();
  try {
    const { gantt, snapshots, pcbs } = simulate(processes, algoSel.value, opts);
    const metrics = calcMetrics(pcbs);
    lastResult  = { gantt, snapshots, pcbs, metrics };
    allSnaps    = snapshots;
    snapIdx     = Math.max(0, snapshots.length - 1);

    // Keep the editable workload in its default Ready state; playback owns live state changes.
    processes.forEach(process => { process.state = 'Ready'; });
    renderTable();
    renderGantt(gantt);
    renderMetrics(metrics);
    renderProcessMetrics(pcbs);
    if (allSnaps.length) renderMonitor(allSnaps[snapIdx]);
    updateStepProgress();
    persist();
    addLog(`${ALGO_META[algoSel.value]?.name} · ${processes.length} proc · ${metrics?.makespan ?? 0}u · AvgWT=${metrics?.avgWT?.toFixed(2) ?? '?'}`);
  } catch (err) {
    console.error(err);
    addLog(`Simulation error: ${err.message}`);
  }
}

// ============================================================
// STEP-BY-STEP PLAYBACK
// ============================================================
function stepTo(idx) {
  if (!allSnaps.length) return;
  snapIdx     = clamp(idx, 0, allSnaps.length - 1);
  const snap  = allSnaps[snapIdx];
  renderMonitor(snap);
  renderGantt(lastResult?.gantt, snap.clock);
  updateStepProgress();
  if (snap.processStates) {
    processes.forEach(p => { const s = snap.processStates.get(p.id); if (s) p.state = s; });
    renderTable();
  }
}

function updateStepProgress() {
  const el = $('stepProgress');
  if (el) el.textContent = allSnaps.length ? `${snapIdx + 1} / ${allSnaps.length}` : '—';
}

function play() {
  if (playTimer || !allSnaps.length) return;
  if (snapIdx >= allSnaps.length - 1) stepTo(0);
  $('playBtn')?.classList.add('hidden');
  $('pauseBtn')?.classList.remove('hidden');
  const spd = Number($('speedSlider')?.value) || 1;
  playTimer  = setInterval(() => {
    snapIdx++;
    if (snapIdx >= allSnaps.length) { pause(); return; }
    stepTo(snapIdx);
  }, Math.round(700 / spd));
}

function pause() {
  clearInterval(playTimer); playTimer = null;
  $('playBtn')?.classList.remove('hidden');
  $('pauseBtn')?.classList.add('hidden');
}

// ============================================================
// SYSTEM LOGS
// ============================================================
const sysLogs = [];
function addLog(msg) {
  sysLogs.unshift({ time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }), message: msg });
  sysLogs.splice(50);
  localStorage.setItem('cpu-simulator-logs', JSON.stringify(sysLogs));
  const list = $('systemLogList');
  if (list) list.innerHTML = sysLogs.map(l =>
    `<li class="system-log-entry"><span class="system-log-time">${l.time}</span><span class="system-log-message">${l.message}</span></li>`).join('');
}

// ============================================================
// WORKSPACE PERSISTENCE
// ============================================================
function persist() {
  const snapshot = {
    processes, algorithm: algoSel.value,
    quantum: quantumIn.value, cs: csIn.value, priConv: priConvIn.value,
  };
  localStorage.setItem(workspaceStorageKey(), JSON.stringify(snapshot));
}
function restore() {
  try {
    const savedRaw = localStorage.getItem(workspaceStorageKey()) || 'null';
    const saved = JSON.parse(savedRaw);
    if (!saved?.processes?.length) return;
    processes       = saved.processes;
    algoSel.value   = saved.algorithm || 'fcfs';
    quantumIn.value = saved.quantum   || 2;
    csIn.value      = saved.cs        || 0;
    priConvIn.value = saved.priConv   || 'lower';
  } catch { /* ignore */ }
}

// ============================================================
// THEME / MOTION / CLOCK
// ============================================================
function setTheme(dark) {
  localStorage.setItem('cpu-simulator-theme', dark ? 'dark' : 'light');
  if (window.A11yManager) {
    window.A11yManager.applyPreferences();
  } else {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    themeBtn?.setAttribute('aria-pressed', String(dark));
    themeBtn?.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn?.querySelector('svg')?.setAttribute('data-lucide', dark ? 'sun' : 'moon');
    $('themeColor')?.setAttribute('content', dark ? '#171918' : '#f4f1ea');
    if (window.lucide) lucide.createIcons();
  }
}
function setMotion(r) {
  document.documentElement.classList.toggle('reduce-motion', r);
  motionBtn?.setAttribute('aria-pressed', String(r));
  localStorage.setItem('cpu-simulator-motion', r ? 'reduced' : 'full');
}
function tickClock() {
  const el = $('sidebarDateTime');
  if (el) el.textContent = new Date().toLocaleString([], { dateStyle:'medium', timeStyle:'medium' });
}

// ============================================================
// EVENT HANDLERS
// ============================================================

// Process table — inline edits
$('processTable').addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.index === undefined) return;
  const p  = processes[+el.dataset.index];
  if (el.dataset.field === 'color') p.color = el.value;
  else if (el.dataset.field === 'id') p.id = el.value.trim() || p.id;
  else p[el.dataset.field] = Math.max(0, +el.value || 0);
  renderTable(); runSim();
});

// Process table — delete row
$('processTable').addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn || processes.length <= 1) return;
  const rm = processes[+btn.dataset.remove];
  processes.splice(+btn.dataset.remove, 1);
  addLog(`Removed ${rm.id}`); renderTable(); runSim();
});

// Add process
$('addProcess').addEventListener('click', () => {
  const i    = processes.length;
  const maxA = Math.max(...processes.map(p => p.arrival), 0);
  processes.push({ id:`P${i+1}`, arrival:maxA+1, burst:3, priority:2, deadline:maxA+15, color:PALETTE[i%PALETTE.length], state:'Ready' });
  addLog(`Added P${i+1}`); renderTable();
});

// Run / Reset
$('runButton').addEventListener('click', runSim);
$('resetButton').addEventListener('click', () => {
  pause();
  processes       = DEFAULT_PROCESSES.map(p => ({ ...p }));
  algoSel.value   = 'fcfs';
  quantumIn.value = 2;
  csIn.value      = 0;
  priConvIn.value = 'lower';
  presetSel.value = 'custom';
  renderAlgoNote(); addLog('Reset to defaults'); renderTable(); runSim();
});

// Algorithm / config changes
algoSel.addEventListener('change',   () => { renderAlgoNote(); addLog(`Algorithm → ${ALGO_META[algoSel.value]?.name}`); runSim(); });
csIn.addEventListener('change',       runSim);
quantumIn.addEventListener('change',  runSim);
priConvIn.addEventListener('change',  runSim);

// Motion
motionBtn?.addEventListener('click', () => setMotion(!document.documentElement.classList.contains('reduce-motion')));

// Playback
$('playBtn')?.addEventListener('click',     play);
$('pauseBtn')?.addEventListener('click',    pause);
$('stepFwdBtn')?.addEventListener('click',  () => { pause(); stepTo(snapIdx + 1); });
$('stepBwdBtn')?.addEventListener('click',  () => { pause(); stepTo(snapIdx - 1); });
$('stepResetBtn')?.addEventListener('click',() => { pause(); stepTo(0); });
$('speedSlider')?.addEventListener('input', e => {
  if ($('speedLabel')) $('speedLabel').textContent = `${e.target.value}×`;
  if (playTimer) { pause(); play(); }
});

// Comparison
$('compareBtn')?.addEventListener('click', () => {
  runComparison();
  const sec = $('comparisonSection');
  sec?.classList.remove('hidden');
  sec?.scrollIntoView({ behavior:'smooth' });
});
$('closeCompare')?.addEventListener('click', () => $('comparisonSection')?.classList.add('hidden'));

// Export
$('exportCSV')?.addEventListener('click',  exportCSV);
$('exportJSON')?.addEventListener('click', exportJSON);

const workloadFile = $('workloadFile');
$('importButton')?.addEventListener('click', () => workloadFile?.click());
workloadFile?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importWorkload(file); } catch (error) { window.alert(`Import failed: ${error.message}`); }
  event.target.value = '';
});

// Workload generator
$('generateBtn')?.addEventListener('click', () => {
  const n      = Math.max(1, Math.min(20, +($('genCount')?.value    || 5)));
  const dist   = $('genDist')?.value     || 'uniform';
  const lam    = Math.max(.1, +($('genLambda')?.value   || 2));
  const maxB   = Math.max(1,  +($('genMaxBurst')?.value || 8));
  fetch(`/api/workload?count=${n}&distribution=${dist}&lambda=${lam}&maxBurst=${maxB}`)
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Python workload service unavailable')))
    .then(data => { processes = normalizeImportedProcesses(data); addLog(`Generated ${n} processes with Python (${dist})`); renderTable(); runSim(); updateNavCount(); })
    .catch(() => { processes = generateWorkload(n, dist, lam, maxB); addLog(`Generated ${n} processes (${dist} dist)`); renderTable(); runSim(); updateNavCount(); });
});

// Preset
presetSel?.addEventListener('change', () => {
  const PRESETS = {
    balanced:     [{ id:'P1',arrival:0,burst:5,priority:2,deadline:10 },{ id:'P2',arrival:1,burst:3,priority:1,deadline:7  },{ id:'P3',arrival:2,burst:8,priority:3,deadline:20 },{ id:'P4',arrival:3,burst:2,priority:2,deadline:8  },{ id:'P5',arrival:4,burst:4,priority:1,deadline:15 }],
    'burst-heavy':[{ id:'P1',arrival:0,burst:24,priority:1,deadline:30},{ id:'P2',arrival:0,burst:3,priority:2,deadline:5  },{ id:'P3',arrival:0,burst:3,priority:3,deadline:5  }],
    interactive:  [{ id:'P1',arrival:0,burst:3,priority:1,deadline:6  },{ id:'P2',arrival:1,burst:2,priority:2,deadline:5  },{ id:'P3',arrival:2,burst:4,priority:1,deadline:9  },{ id:'P4',arrival:4,burst:2,priority:3,deadline:8  },{ id:'P5',arrival:5,burst:3,priority:2,deadline:10 }],
    realtime:     [{ id:'P1',arrival:0,burst:2,priority:1,deadline:4  },{ id:'P2',arrival:1,burst:4,priority:2,deadline:8  },{ id:'P3',arrival:0,burst:1,priority:1,deadline:2  },{ id:'P4',arrival:2,burst:3,priority:3,deadline:10 }],
  };
  const ps = PRESETS[presetSel.value];
  if (!ps) return;
  processes = ps.map((p, i) => ({ ...p, color:PALETTE[i%PALETTE.length], state:'Ready' }));
  addLog(`Preset: ${presetSel.value}`); renderTable(); runSim();
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'r')          runSim();
  if (e.key === ' ')         { e.preventDefault(); playTimer ? pause() : play(); }
  if (e.key === 'ArrowRight'){ pause(); stepTo(snapIdx + 1); }
  if (e.key === 'ArrowLeft') { pause(); stepTo(snapIdx - 1); }
});

// Nav count update
function updateNavCount() {
  const el = document.querySelector('.nav-count');
  if (el) el.textContent = processes.length;
}

// ============================================================
// INIT
// ============================================================
if (window.A11yManager) {
  window.A11yManager.applyPreferences();
} else {
  setTheme(localStorage.getItem('cpu-simulator-theme') === 'dark');
}
setMotion(localStorage.getItem('cpu-simulator-motion') === 'reduced');
restore();
renderAlgoNote();
renderTable();
runSim();
tickClock();
setInterval(tickClock, 1000);
