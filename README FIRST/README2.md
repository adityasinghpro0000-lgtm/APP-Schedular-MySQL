# Scheduler Configuration, Workloads, and Gantt Output

This guide explains how to set up a simulation, move jobs from the long-term scheduler into the CPU process queue, and read the **Output · Gantt Chart**.

## Scheduler configuration

### Presets

The **Preset** menu loads a ready-made process workload:

| Preset | What it demonstrates |
| --- | --- |
| Balanced workload | A mix of arrival times, priorities, and burst lengths. |
| Burst-heavy workload | A long process alongside short processes. |
| Interactive workload | Processes arriving over time with varied bursts. |

Selecting a preset replaces the current process workload and recalculates the simulation. Presets are starting points; process values can be edited in the **Process queue**.

### CPU scheduling algorithm

Choose the short-term CPU scheduling policy:

| Choice | How the next process is selected |
| --- | --- |
| FCFS | Earliest arrival first; a running process is not preempted. |
| SJF | Shortest total CPU burst among processes that have arrived. |
| SRTF | Shortest remaining CPU time; a newly arrived process can preempt. |
| RR | Processes take turns using the configured time quantum. |
| Priority (Non-Preemptive) | Highest configured priority among arrived processes; runs to completion. |
| Priority (Preemptive) | A higher-priority arrival can preempt the running process. |
| MLFQ | Multiple feedback queues with configurable quanta and aging. |
| EDF | Earliest deadline first. |
| CFS | Lowest virtual runtime first. |

### Algorithm settings

- **Time quantum (Q):** The time slice used by Round Robin. MLFQ instead exposes a quantum for each feedback queue. These controls appear only when relevant to the selected algorithm.
- **Context switch (`t_cs`):** Simulated overhead, in time units, when the CPU changes processes. Zero means no context-switch delay.
- **Priority convention:** Select whether a lower or higher numeric value represents greater priority. This applies to both CPU priority policies and the long-term priority admission policy.
- **MLFQ quanta:** The time slices for its queues, from the highest-priority queue to lower queues. The defaults are 2, 4, and 8 units.

Changing an algorithm setting recalculates the run. Use the playback controls to inspect its snapshots.

## Workload setup

### Process queue

The **Process queue** is the short-term CPU scheduler's workload. Each row shows a process identifier, arrival time, CPU burst, priority, optional deadline, and current state. Edit a row to update the process; use its remove control to delete it. The State column follows the selected simulation snapshot.

### Long-term job scheduler

Use the **Job scheduler** to add work before it becomes a CPU process. A job has an ID such as `J1`, arrival time, burst, priority, and deadline. Adding a job puts it in the long-term queue; it does not create a PCB or add a row to the Process queue yet.

To admit work:

1. Choose an **Admission policy**: FCFS, SJF, Priority, or EDF.
2. Set **Admission time**. Only jobs whose arrival time is at or before this time are eligible.
3. Set **Batch capacity** to limit the number admitted in this operation.
4. Select **Admit jobs to CPU queue**.

Each admitted job is assigned a process ID and PCB, with the job ID retained as its parent. For example, `J1` may be admitted as process `P6`. The PCB enters the Process queue as `New`. When its arrival/admission time is reached, it enters `Ready`; the CPU scheduler can then select it to run. Jobs not admitted remain in the long-term queue.

### Workload tools

- **Generate:** Replaces the process workload with a generated set. In the current interface, the button uses the generator defaults: five processes, uniform arrivals, lambda 2, and maximum burst 8. The local server's `/api/workload` endpoint also accepts `count`, `distribution`, `lambda`, and `maxBurst`; the browser uses a local fallback if the endpoint is unavailable.
- **Import:** Loads a process workload from JSON or CSV and replaces the current Process queue workload.
- **JSON / CSV:** Downloads the current simulation's process results in the chosen format.

The workload generator supports uniform, Poisson, and exponential distributions through its API. Imported processes require an ID and positive burst; arrival defaults to zero and priority defaults to one. Deadlines are optional and receive a default when omitted.

## Reading the Output Gantt chart

The Gantt chart aligns long-term job admission, short-term CPU execution, and process lifecycle information against one time axis.

### View tabs

- **Unified (Dual-Tier):** Shows both the long-term job track and short-term CPU track together.
- **CPU Execution:** Hides the job track and focuses on CPU activity.
- **Process Swimlanes:** Hides the two scheduler tracks and shows one lifecycle row per process.

### Scale

- **Fit to width** fits the timeline to the available chart width.
- **Normal** uses the standard time-unit width.
- **Expanded** gives each time unit more screen space for detailed inspection.

### Tracks and blocks

In Unified view, read the chart from top to bottom:

1. **Job Admission & Spooling Track (long-term scheduler):** A queued job is shown as a hatched **Pool** block from its submission/arrival until admission. After admission, a colored block shows the job in the system through process completion. Its label connects the job and process IDs, for example `J1 → P6`.
2. **CPU Execution Timeline (short-term scheduler):** Colored blocks show which process uses the CPU and for how long. Adjacent intervals for the same process are combined. **IDLE** means no process is running. **CS** marks context-switch overhead.
3. **Process Swimlanes (available in its own view):** Each process has a row. Ready-queue waits, CPU running periods, job-pool waits, and context-switch periods are placed on the same time scale. A vertical deadline marker indicates the deadline; green means it was met and red means it was missed.

The legend under the chart identifies CPU execution, context switches, idle time, ready-queue waits, job-pool waits, and deadline markers. Process colors are consistent across the queue, chart, and swimlanes.

### Time axis and playhead

The axis is shared by all tracks. It includes important event boundaries such as arrivals, admissions, CPU-block boundaries, completions, and deadlines, plus regular tick marks. The playhead highlights the currently selected snapshot; the clock and step counter show its time and position in playback.

The **Reset schedulers** button in the Output header clears the short-term process queue and long-term job queue, along with the displayed run. Scheduler configuration remains available.

### Playback and inspection controls

- **Reset playback:** Return to the first snapshot, before processes enter the ready queue.
- **Previous / Next:** Move one snapshot backward or forward.
- **Play / Pause:** Animate snapshots in order. The speed slider changes playback speed.
- **Seek / Go:** Enter a time and jump to the nearest simulation snapshot for that time.
- **Hover a CPU block or swimlane segment:** Open the PCB tooltip. It shows the process state from the selected process-queue snapshot, along with process inputs and calculated timing values.

The process queue State column and PCB tooltip use the selected snapshot, so stepping or playing updates the displayed state through `New`, `Ready`, `Running`, and `Terminated` as the process moves through the simulation.

## Example: follow one job

1. Add `J1` in the long-term Job scheduler. It appears in the job table and job-pool track; it has no CPU process row yet.
2. Admit `J1` using the admission controls. The job leaves the pending queue and is assigned a process ID and PCB, such as `P6`.
3. Start at the first playback snapshot to see `P6` as `New` in the Process queue.
4. Step forward to its arrival/admission snapshot. It becomes `Ready` in the process queue before the CPU scheduler selects it.
5. Continue playback to see it as `Running`, then `Terminated` at completion. The PCB tooltip and process row follow the selected snapshot.

