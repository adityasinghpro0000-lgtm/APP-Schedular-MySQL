# CPU Scheduling Simulator

A browser based CPU scheduling simulator with an integrated job queue. Build workloads, explore classic and modern scheduling policies, step through execution, compare results, and inspect process timelines and performance metrics.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Using the simulator](#using-the-simulator)
- [How the simulation works](#how-the-simulation-works)
- [Scheduling algorithms](#scheduling-algorithms)
- [Workloads](#workloads)
- [Import and export formats](#import-and-export-formats)
- [Metrics](#metrics)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Profiles and saved data](#profiles-and-saved-data)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)

## Features

- Simulate nine CPU scheduling algorithms, including preemptive and non-preemptive policies.
- Create and edit process workloads, or queue jobs and admit them to the CPU queue using a long-term scheduling policy.
- Inspect the CPU Gantt chart, job admission timeline, and process lifecycle swimlanes.
- Play, pause, and step through tick-by-tick simulation snapshots.
- Compare algorithm results against the current workload.
- Review per-process completion data and aggregate scheduling metrics.
- Import workloads from JSON and CSV; export results in either format.
- Generate uniform, Poisson, and exponential workloads.
- Save settings and workloads in browser storage, separated by profile and workspace.
- Use light or dark themes and accessibility controls for text size, zoom, contrast, and reduced motion.

## Requirements

- Python 3.9 or newer for the included local server and optional workload API.
- A modern browser with JavaScript and `localStorage` enabled.
- No Python packages or JavaScript package installation is required. The application uses plain HTML, CSS, and JavaScript. Some icons and fonts are loaded from external CDNs when online.

## Run locally

From the repository root, start the included server:

```bash
python Backend/server.py
```

On systems where Python is named `python3`:

```bash
python3 Backend/server.py
```

Then visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/). The landing page opens the workspace. Choose **Start simulating** to open the simulator.

The server binds to `127.0.0.1` on port `8000` and serves files from `Frontend/`. It also provides `GET /api/workload` for workload generation. If the API cannot be reached, the browser falls back to its own generator. To stop the server, press `Ctrl+C` in the terminal where it is running.

You can also open `Frontend/index.html` directly in a browser for basic simulation. Running through the local server is recommended because the workload API requires HTTP, and browsers can restrict features on `file://` pages.

## Using the simulator

1. Open **Process Queue** and add, edit, or remove processes. Each process has an ID, arrival time, CPU burst, priority, and optional deadline.
2. Choose an algorithm. Configure its time quantum, priority convention, or context switch cost when those controls are available.
3. The simulation and metrics update from the current workload. Use **Play**, **Pause**, and the step controls to explore execution over time.
4. Inspect the Gantt chart. Switch its view or scale to focus on CPU execution or the process lifecycle. Hover over a process block for process control block (PCB) details.
5. Use **Compare algorithms** to compare policies on the same workload.
6. Optionally use the **JOB Queue** to add jobs that have not yet entered the CPU queue. Choose an admission policy and admit eligible jobs to the process queue.
7. Import a workload to replace the current process list, or export the current result for later use.

Benchmark presets include balanced, burst-heavy, and interactive workloads. A real-time preset is also available in the application where exposed by the preset selector.

### Job queue and admission

Jobs have an ID, arrival time, burst, priority, and deadline. The long-term scheduler chooses which arrived jobs to admit to the CPU process queue. Available policies include FCFS, SJF, priority, and EDF. A job's submission and admission times are tracked separately, so the timeline and job metrics can show time spent waiting for admission as well as CPU scheduling.

## How the simulation works

The simulator models two scheduling stages:

1. **Long-term scheduling (job admission):** Jobs begin in the job queue. A job becomes eligible when its arrival time is at or before the selected admission time. Choose FCFS, SJF, priority, or EDF, then admit up to the configured batch capacity. Admitted jobs leave the job queue and enter the CPU process queue. Jobs that are not yet eligible or exceed the batch capacity remain queued.
2. **Short-term scheduling (CPU execution):** The selected CPU algorithm chooses among processes that have arrived and are ready. Each simulation step advances the clock and updates process states and remaining CPU burst. Preemptive algorithms can switch the running process when their scheduling rule calls for it; Round Robin uses its time quantum. A configured context-switch cost adds overhead when the CPU changes processes.

Processes can also be added directly to the process queue, bypassing job admission. Their arrival times still determine when they become eligible for CPU scheduling. Use **Play**, **Pause**, and the step controls to inspect the saved execution snapshots. The unified Gantt view aligns job admission and CPU execution, while the process lifecycle view shows waiting, running, and completion states.

The **Reset schedulers** button clears both the long-term job queue and the short-term process queue for the current workspace. It also clears the displayed run results and updates the long-term Gantt track count to **0 jobs**; scheduler settings remain available for the next workload.

## Scheduling algorithms

| Algorithm | Type | Selection rule |
| --- | --- | --- |
| FCFS (First Come, First Served) | Non-preemptive | Runs available processes in arrival order. |
| SJF (Shortest Job First) | Non-preemptive | Selects the available process with the smallest total burst. |
| SRTF (Shortest Remaining Time First) | Preemptive | Runs the available process with the least remaining CPU time. |
| Round Robin (RR) | Preemptive | Cycles through processes using a configurable time quantum. |
| Priority | Preemptive or non-preemptive | Selects according to process priority; configure whether lower or higher values mean greater priority. |
| MLFQ (Multi-Level Feedback Queue) | Preemptive | Uses multiple queues and time quanta; processes can move between levels, with aging to reduce starvation. |
| EDF (Earliest Deadline First) | Preemptive | Selects the process with the earliest deadline. |
| CFS (Completely Fair Scheduler) | Preemptive | Selects the process with the least virtual runtime. |

The simulator models scheduling for learning and comparison. Its policies are simplified models; results are not intended to represent every detail of a production operating system scheduler or to provide real-time guarantees.

## Workloads

### Generate a workload

Choose a process count, arrival distribution, distribution parameter, and maximum burst, then select **Generate**. The generator supports:

- **Uniform**: randomized arrival gaps and burst lengths within the configured range.
- **Poisson**: stochastic arrivals and burst lengths based on exponential sampling.
- **Exponential**: exponentially distributed arrival gaps and burst lengths.

The local Python endpoint accepts these query parameters:

| Parameter | Default | Range / values |
| --- | --- | --- |
| `count` | `5` | Clamped to 1–20 processes |
| `distribution` | `uniform` | `uniform`, `poisson`, or `exponential` |
| `lambda` | `2` | Minimum 0.1 |
| `maxBurst` | `8` | Minimum 1 |

Example: `/api/workload?count=8&distribution=poisson&lambda=2&maxBurst=10`.

### Process fields

| Field | Meaning | Constraints |
| --- | --- | --- |
| `id` | Unique process identifier | Required; IDs must be unique in an imported workload. |
| `arrival` | Time the process enters the ready queue | Zero or greater. |
| `burst` | CPU time required | At least 1. |
| `priority` | Scheduling priority | Defaults to 1 when omitted. |
| `deadline` | Absolute deadline used by EDF and deadline display | Optional; if omitted during import, a default is assigned. |

## Import and export formats

### JSON import

Provide either a top-level array or an object containing a `processes` array. The required fields are `id` and `burst`; `arrival` defaults to zero and `priority` defaults to one.

```json
[
  { "id": "P1", "arrival": 0, "burst": 5, "priority": 2, "deadline": 10 },
  { "id": "P2", "arrival": 1, "burst": 3, "priority": 1, "deadline": 7 }
]
```

Equivalent wrapped form:

```json
{
  "processes": [
    { "id": "P1", "arrival": 0, "burst": 5 }
  ]
}
```

### CSV import

CSV must have a header row and at least one process row. Column names are case-insensitive. Supported names include:

- ID: `id` or `PID`
- Arrival: `arrival` or `AT`
- Burst: `burst` or `BT`
- Priority: `priority` or `Priority`
- Deadline: `deadline` or `Deadline`

Example:

```csv
id,arrival,burst,priority,deadline
P1,0,5,2,10
P2,1,3,1,7
```

Arrival and burst values must be valid numbers, burst must be at least 1, and process IDs must be unique. Importing a workload replaces the active process list.

### Export

Use the CSV or JSON export controls to download the current process results. Exports include scheduling outcome fields such as completion time, turnaround time, waiting time, and response time where applicable.

## Metrics

The simulator reports average waiting time, average turnaround time, average response time, CPU utilization, and throughput. Per-process results include arrival time (AT), burst time (BT), completion time (CT), turnaround time (TAT), waiting time (WT), response time (RT), and deadline status when available.

- **Turnaround time** = completion time − arrival time.
- **Waiting time** = turnaround time − CPU burst.
- **Response time** = first CPU start − arrival time.
- **Throughput** = completed processes per simulated time unit.
- **CPU utilization** = CPU execution time as a percentage of elapsed simulation time (including configured context switch effects as modeled by the simulator).

The job queue also tracks delay between job submission and admission, and total turnaround from job submission to process completion.

## Keyboard shortcuts

Shortcuts work when focus is not inside an input, select, or text area.

| Key | Action |
| --- | --- |
| `R` | Run or refresh the simulation |
| `Space` | Play or pause playback |
| `→` | Advance one snapshot |
| `←` | Go back one snapshot |

## Profiles and saved data

The application stores simulator state, profiles, workspace selection, theme, and accessibility preferences in browser `localStorage`. Workload/settings storage is scoped to the selected profile and workspace. Data is local to the browser and is not uploaded to a remote account. Clearing site data or using another browser profile/device will not carry the saved state across.

The profile controls allow creating or renaming a profile, switching profiles, resetting profile data, resetting the view, and clearing logs.

## Project structure

```text
.
├── Backend/
│   └── server.py           # Static file server and workload generation API
├── Frontend/
│   ├── index.html          # CPU scheduling simulator
│   ├── app.js              # Simulation engine and simulator interactions
│   ├── styles.css          # Shared simulator styles
│   ├── workspace.html      # Workspace landing page
│   ├── workspace.css       # Workspace styles
│   ├── profile.html        # Profile management view
│   ├── profile.js          # Profile state and interactions
│   ├── profile.css         # Profile styles
│   ├── logs.html           # System log view
│   ├── about.html          # Project information
│   └── accessibility.js    # Theme and accessibility preferences
└── tests/
    └── profile.test.js     # Profile reset behavior test
```

## Tests

The repository includes a Node.js test for profile reset behavior. With Node.js installed, run it from the repository root:

```bash
node tests/profile.test.js
```

## Troubleshooting

- **The page does not load at port 8000:** Check that the server is running and that the port is available. Open `http://127.0.0.1:8000/`.
- **The workload API fails:** The browser generator is used as a fallback. Confirm the Python server is running if you specifically want API-backed generation.
- **Saved data is missing:** Check that browser storage is enabled and that you are using the same browser, profile, and workspace.
- **Icons or fonts are missing:** Those assets load from external CDNs and may not appear without network access; the simulator itself is local.
- **Imports fail:** Check the required JSON structure or CSV headers, unique IDs, non-negative arrival times, and positive burst values.

## Academic project

This project was developed for course 21CSC203P at SRM Institute of Science and Technology, Ramapuram. The project team and academic details are listed on the in-app About page.
