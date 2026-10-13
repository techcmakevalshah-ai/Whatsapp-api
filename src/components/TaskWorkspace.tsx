import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  Filter,
  Flag,
  ListTodo,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  UserRound,
  X,
} from 'lucide-react';
import {
  createFlowluBoardTask,
  getFlowluTasks,
  runFlowluTaskTimer,
  updateFlowluBoardTask,
  type FlowluTask,
  type FlowluTaskBoardResponse,
  type FlowluTaskStage,
  type FlowluTaskStatus,
  type FlowluTaskTimerSession,
} from '../lib/flowluTasks';
import './TaskWorkspace.css';

type TaskView = 'todo' | 'board' | 'list' | 'gantt' | 'calendar';
type QuickFilter = 'all' | 'today' | 'no-deadline' | 'overdue';

type BoardColumn = {
  key: string;
  label: string;
  systemStatus: FlowluTaskStatus;
  stageId?: number;
  tone: string;
};

const SYSTEM_COLUMNS: BoardColumn[] = [
  { key: 'system-1', label: 'To Do', systemStatus: 1, tone: 'blue' },
  { key: 'system-3', label: 'In Progress', systemStatus: 3, tone: 'amber' },
  { key: 'system-4', label: 'Review', systemStatus: 4, tone: 'violet' },
  { key: 'system-5', label: 'Complete', systemStatus: 5, tone: 'green' },
];

const EMPTY_BOARD: FlowluTaskBoardResponse = {
  tasks: [], users: [], workflows: [], stages: [], timerReady: true,
  sessions: [], totalsByTask: {}, runningByTask: {}, currentTimer: null, syncedAt: '',
};

function parseDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateLabel(value?: string | null) {
  const date = parseDate(value);
  if (!date) return 'No deadline';
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function dateTimeInput(value?: string | null) {
  const date = parseDate(value);
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatSeconds(total: number, withSeconds = false) {
  const seconds = Math.max(0, Math.round(total || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  if (withSeconds) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${seconds}s`;
}

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'T';
}

function priorityLabel(priority: number) {
  return priority === 3 ? 'High' : priority === 1 ? 'Low' : 'Medium';
}

function runningSeconds(session: FlowluTaskTimerSession | undefined | null, nowMs: number) {
  if (!session) return 0;
  if (session.endedAt) return session.durationSeconds;
  const started = new Date(session.startedAt).getTime();
  return Number.isFinite(started) ? Math.max(0, Math.floor((nowMs - started) / 1000)) : 0;
}

function statusLabel(status: FlowluTaskStatus) {
  return SYSTEM_COLUMNS.find((item) => item.systemStatus === status)?.label || 'Task';
}

function toneFor(index: number, status: FlowluTaskStatus) {
  if (status === 5) return 'green';
  if (status === 4) return 'violet';
  if (status === 3) return 'amber';
  return index % 2 ? 'cyan' : 'blue';
}

function taskStart(task: FlowluTask) {
  return parseDate(task.planStartDate) || parseDate(task.created) || parseDate(task.deadline);
}

function taskEnd(task: FlowluTask) {
  return parseDate(task.planEndDate) || parseDate(task.deadline) || taskStart(task);
}

export function TaskWorkspace() {
  const [data, setData] = useState<FlowluTaskBoardResponse>(EMPTY_BOARD);
  const [view, setView] = useState<TaskView>('board');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [assigneeId, setAssigneeId] = useState(0);
  const [priority, setPriority] = useState(0);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(() => Number(window.localStorage.getItem('task_workflow_id') || 0) || 0);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [createForm, setCreateForm] = useState({
    name: '', responsibleId: 0, deadline: '', description: '', priority: 2 as 1 | 2 | 3,
    estimateMinutes: 30, workflowId: 0, workflowStageId: 0,
  });
  const [editForm, setEditForm] = useState({
    responsibleId: 0, deadline: '', priority: 2 as 1 | 2 | 3,
    estimateMinutes: 0, workflowId: 0, workflowStageId: 0,
  });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const next = await getFlowluTasks({ includeCompleted: true });
      setData({ ...EMPTY_BOARD, ...next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tasks.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(refresh);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedWorkflowId && !data.workflows.some((item) => item.id === selectedWorkflowId)) {
      setSelectedWorkflowId(0);
      window.localStorage.removeItem('task_workflow_id');
    }
  }, [data.workflows, selectedWorkflowId]);

  const selectedTask = useMemo(() => data.tasks.find((task) => task.id === selectedTaskId) || null, [data.tasks, selectedTaskId]);

  useEffect(() => {
    if (!selectedTask) return;
    setEditForm({
      responsibleId: selectedTask.responsibleId || 0,
      deadline: dateTimeInput(selectedTask.deadline),
      priority: selectedTask.priority,
      estimateMinutes: Math.round(selectedTask.timeEstimate / 60),
      workflowId: selectedTask.workflowId || 0,
      workflowStageId: selectedTask.workflowStageId || 0,
    });
  }, [selectedTask]);

  const workflowStages = useMemo(
    () => data.stages.filter((stage) => stage.workflowId === selectedWorkflowId),
    [data.stages, selectedWorkflowId],
  );

  const columns = useMemo<BoardColumn[]>(() => {
    if (!selectedWorkflowId || !workflowStages.length) return SYSTEM_COLUMNS;
    return workflowStages.map((stage, index) => ({
      key: `stage-${stage.id}`,
      label: stage.name,
      systemStatus: stage.systemStatus,
      stageId: stage.id,
      tone: toneFor(index, stage.systemStatus),
    }));
  }, [selectedWorkflowId, workflowStages]);

  const filteredTasks = useMemo(() => {
    const search = query.trim().toLowerCase();
    const today = new Date();
    return data.tasks.filter((task) => {
      if (selectedWorkflowId && task.workflowId !== selectedWorkflowId) return false;
      if (search && !`${task.name} ${task.description} ${task.responsibleName}`.toLowerCase().includes(search)) return false;
      if (assigneeId && task.responsibleId !== assigneeId) return false;
      if (priority && task.priority !== priority) return false;
      if (quickFilter === 'overdue' && !task.overdue) return false;
      if (quickFilter === 'no-deadline' && task.deadline) return false;
      if (quickFilter === 'today') {
        const due = parseDate(task.deadline);
        if (!due || !sameDay(due, today)) return false;
      }
      return true;
    });
  }, [data.tasks, selectedWorkflowId, query, assigneeId, priority, quickFilter]);

  const counters = useMemo(() => {
    const today = new Date();
    let dueToday = 0;
    let noDeadline = 0;
    let overdue = 0;
    for (const task of data.tasks) {
      if (selectedWorkflowId && task.workflowId !== selectedWorkflowId) continue;
      if (task.status === 5) continue;
      if (!task.deadline) noDeadline += 1;
      const due = parseDate(task.deadline);
      if (due && sameDay(due, today)) dueToday += 1;
      if (task.overdue) overdue += 1;
    }
    return { dueToday, noDeadline, overdue };
  }, [data.tasks, selectedWorkflowId]);

  const taskSpent = useCallback((task: FlowluTask) => {
    const tracked = Number(data.totalsByTask[String(task.id)] || 0) + runningSeconds(data.runningByTask[String(task.id)], tick);
    return Math.max(task.timeSpent, tracked);
  }, [data.totalsByTask, data.runningByTask, tick]);

  const boardTaskMatchesColumn = (task: FlowluTask, column: BoardColumn) => column.stageId ? task.workflowStageId === column.stageId : task.status === column.systemStatus;

  const chooseWorkflow = (workflowId: number) => {
    setSelectedWorkflowId(workflowId);
    if (workflowId) window.localStorage.setItem('task_workflow_id', String(workflowId));
    else window.localStorage.removeItem('task_workflow_id');
    setQuickFilter('all');
  };

  const openCreate = () => {
    setCreateForm((current) => ({
      ...current,
      workflowId: selectedWorkflowId,
      workflowStageId: workflowStages[0]?.id || 0,
    }));
    setCreateOpen(true);
  };

  const createTask = async () => {
    if (!createForm.name.trim()) return setError('Enter a task name.');
    if (!createForm.responsibleId) return setError('Choose a responsible user.');
    setWorkingId(-1);
    setError('');
    try {
      await createFlowluBoardTask({
        name: createForm.name.trim(),
        responsibleId: createForm.responsibleId,
        deadline: createForm.deadline || undefined,
        description: createForm.description || undefined,
        priority: createForm.priority,
        timeEstimateSeconds: Math.max(0, Number(createForm.estimateMinutes || 0)) * 60,
        workflowId: createForm.workflowId || undefined,
        workflowStageId: createForm.workflowStageId || undefined,
      });
      setCreateOpen(false);
      setCreateForm((current) => ({ ...current, name: '', deadline: '', description: '', priority: 2, estimateMinutes: 30 }));
      setNotice('Task created.');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create task.');
    } finally {
      setWorkingId(null);
    }
  };

  const saveTask = async () => {
    if (!selectedTask) return;
    setWorkingId(selectedTask.id);
    setError('');
    try {
      const selectedStage = data.stages.find((stage) => stage.id === editForm.workflowStageId);
      await updateFlowluBoardTask({
        id: selectedTask.id,
        responsibleId: editForm.responsibleId || undefined,
        deadline: editForm.deadline || undefined,
        priority: editForm.priority,
        timeEstimateSeconds: Math.max(0, editForm.estimateMinutes) * 60,
        workflowId: editForm.workflowId || null,
        workflowStageId: editForm.workflowStageId || null,
        status: selectedStage?.systemStatus,
      });
      setNotice('Task updated.');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update task.');
    } finally {
      setWorkingId(null);
    }
  };

  const changeStatus = async (task: FlowluTask, status: FlowluTaskStatus) => {
    setWorkingId(task.id);
    try {
      await updateFlowluBoardTask({ id: task.id, status });
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update task status.');
    } finally {
      setWorkingId(null);
    }
  };

  const completeTask = async (task: FlowluTask) => {
    const stage = task.workflowId ? data.stages.find((item) => item.workflowId === task.workflowId && item.systemStatus === 5) : undefined;
    if (stage) {
      setWorkingId(task.id);
      try {
        await updateFlowluBoardTask({ id: task.id, workflowId: stage.workflowId, workflowStageId: stage.id, status: 5 });
        await load(true);
      } finally { setWorkingId(null); }
      return;
    }
    await changeStatus(task, 5);
  };

  const timerAction = async (task: FlowluTask, action: 'start' | 'pause' | 'stop' | 'complete') => {
    setWorkingId(task.id);
    setError('');
    try {
      await runFlowluTaskTimer({ taskId: task.id, taskName: task.name, timerAction: action });
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update timer.');
    } finally {
      setWorkingId(null);
    }
  };

  const todoGroups = useMemo(() => {
    const now = new Date();
    const active = filteredTasks.filter((task) => task.status !== 5);
    return [
      { key: 'overdue', label: 'Overdue', tasks: active.filter((task) => task.overdue) },
      { key: 'today', label: 'Today', tasks: active.filter((task) => { const due = parseDate(task.deadline); return !task.overdue && !!due && sameDay(due, now); }) },
      { key: 'upcoming', label: 'Upcoming', tasks: active.filter((task) => { const due = parseDate(task.deadline); return !!due && !task.overdue && !sameDay(due, now); }).sort((a, b) => (parseDate(a.deadline)?.getTime() || 0) - (parseDate(b.deadline)?.getTime() || 0)) },
      { key: 'none', label: 'No deadline', tasks: active.filter((task) => !task.deadline) },
    ];
  }, [filteredTasks]);

  const gantt = useMemo(() => {
    const dated = filteredTasks.filter((task) => taskStart(task) || taskEnd(task));
    const starts = dated.map((task) => taskStart(task)?.getTime()).filter((value): value is number => Number.isFinite(value));
    const ends = dated.map((task) => taskEnd(task)?.getTime()).filter((value): value is number => Number.isFinite(value));
    const today = startOfDay(new Date()).getTime();
    const min = starts.length ? Math.min(...starts, today) : today;
    const max = ends.length ? Math.max(...ends, today + 13 * 86_400_000) : today + 13 * 86_400_000;
    const start = startOfDay(new Date(min));
    const rawDays = Math.ceil((startOfDay(new Date(max)).getTime() - start.getTime()) / 86_400_000) + 1;
    const days = Math.max(14, Math.min(45, rawDays));
    const labels = Array.from({ length: days }, (_, index) => new Date(start.getTime() + index * 86_400_000));
    return { dated, start, days, labels };
  }, [filteredTasks]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  }, [calendarMonth]);

  const renderTaskCard = (task: FlowluTask) => {
    const running = data.runningByTask[String(task.id)];
    return (
      <article className={`task-v2-card ${task.overdue ? 'overdue' : ''} ${running ? 'running' : ''}`} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
        <div className="task-v2-card-title"><strong>{task.name}</strong>{task.priority === 3 && <Flag size={14}/>}</div>
        {task.description && <p>{task.description.replace(/<[^>]*>/g, '').slice(0, 95)}</p>}
        <div className="task-v2-person"><span>{initials(task.responsibleName)}</span>{task.responsibleName}</div>
        <div className="task-v2-card-meta"><span><CalendarDays size={13}/>{dateLabel(task.deadline)}</span><span><Clock3 size={13}/>{formatSeconds(taskSpent(task))}</span></div>
        {running && <div className="task-v2-live">● {formatSeconds(runningSeconds(running, tick), true)}</div>}
      </article>
    );
  };

  return (
    <section className="task-v2">
      <header className="task-v2-head">
        <div>
          <h1>Tasks</h1>
          <p>Plan work, track deadlines and manage execution without mixing task stages with CRM pipelines.</p>
        </div>
        <div className="task-v2-head-actions">
          <select value={selectedWorkflowId} onChange={(event) => chooseWorkflow(Number(event.target.value))}>
            <option value={0}>Default Workflow</option>
            {data.workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}
          </select>
          <button className="task-v2-create" onClick={openCreate}><Plus size={17}/> Create Task</button>
        </div>
      </header>

      <nav className="task-v2-tabs">
        <button className={view === 'todo' ? 'active' : ''} onClick={() => setView('todo')}><ListTodo size={16}/> To-Do List</button>
        <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><Columns3 size={16}/> Kanban Board</button>
        <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><ListTodo size={16}/> List View</button>
        <button className={view === 'gantt' ? 'active' : ''} onClick={() => setView('gantt')}><BarChart3 size={16}/> Gantt</button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={16}/> Calendar</button>
      </nav>

      {data.currentTimer && (() => {
        const task = data.tasks.find((item) => item.id === data.currentTimer?.taskId);
        return task ? <button className="task-v2-running" onClick={() => setSelectedTaskId(task.id)}><span>Running now</span><strong>{task.name}</strong><b>{formatSeconds(runningSeconds(data.currentTimer, tick), true)}</b></button> : null;
      })()}

      {!data.timerReady && <div className="task-v2-warning">Timer history storage still needs migration 005 before Start / Pause / Stop can be used.</div>}
      {error && <div className="task-v2-error">{error}</div>}
      {notice && <div className="task-v2-notice">{notice}</div>}

      <div className="task-v2-toolbar">
        <label><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks"/></label>
        <button className="filter-button" title="Filters"><Filter size={17}/></button>
        <select value={assigneeId} onChange={(event) => setAssigneeId(Number(event.target.value))}><option value={0}>All assignees</option>{data.users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select>
        <select value={priority} onChange={(event) => setPriority(Number(event.target.value))}><option value={0}>All priorities</option><option value={3}>High</option><option value={2}>Medium</option><option value={1}>Low</option></select>
        <button className={quickFilter === 'today' ? 'chip active' : 'chip'} onClick={() => setQuickFilter(quickFilter === 'today' ? 'all' : 'today')}>{counters.dueToday} Today</button>
        <button className={quickFilter === 'no-deadline' ? 'chip active' : 'chip'} onClick={() => setQuickFilter(quickFilter === 'no-deadline' ? 'all' : 'no-deadline')}>{counters.noDeadline} No deadline</button>
        <button className={quickFilter === 'overdue' ? 'chip danger active' : 'chip danger'} onClick={() => setQuickFilter(quickFilter === 'overdue' ? 'all' : 'overdue')}>{counters.overdue} Overdue</button>
      </div>

      {loading && !data.tasks.length ? <div className="task-v2-empty">Loading tasks…</div> : view === 'todo' ? (
        <div className="task-v2-todo">
          {todoGroups.map((group) => <section key={group.key} className="task-v2-todo-group"><header><h3>{group.label}</h3><span>{group.tasks.length}</span></header>{group.tasks.length ? group.tasks.map((task) => <button className="task-v2-todo-row" key={task.id} onClick={() => setSelectedTaskId(task.id)}><span className="todo-check" onClick={(event) => { event.stopPropagation(); void completeTask(task); }}><Check size={14}/></span><div><strong>{task.name}</strong><small>{task.responsibleName} · {dateLabel(task.deadline)}</small></div><span className={`priority p${task.priority}`}>{priorityLabel(task.priority)}</span></button>) : <div className="task-v2-group-empty">Nothing here</div>}</section>)}
        </div>
      ) : view === 'board' ? (
        <div className="task-v2-board">
          {columns.map((column) => {
            const tasks = filteredTasks.filter((task) => boardTaskMatchesColumn(task, column));
            return <section className={`task-v2-column tone-${column.tone}`} key={column.key}><header><div><strong>{column.label}</strong><span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span></div><b>{formatSeconds(tasks.reduce((sum, task) => sum + taskSpent(task), 0))}</b></header><div className="task-v2-column-list">{tasks.length ? tasks.map(renderTaskCard) : <div className="task-v2-column-empty">No tasks</div>}</div></section>;
          })}
        </div>
      ) : view === 'list' ? (
        <div className="task-v2-table-wrap"><table className="task-v2-table"><thead><tr><th>Task</th><th>Stage</th><th>Assignee</th><th>Deadline</th><th>Priority</th><th>Time</th></tr></thead><tbody>{filteredTasks.map((task) => <tr key={task.id} onClick={() => setSelectedTaskId(task.id)}><td><strong>{task.name}</strong><small>#{task.id}</small></td><td><span className={`status s${task.status}`}>{task.workflowStageId ? data.stages.find((stage) => stage.id === task.workflowStageId)?.name || statusLabel(task.status) : statusLabel(task.status)}</span></td><td><span className="person-cell"><i>{initials(task.responsibleName)}</i>{task.responsibleName}</span></td><td className={task.overdue ? 'overdue-text' : ''}>{dateLabel(task.deadline)}</td><td>{priorityLabel(task.priority)}</td><td>{formatSeconds(taskSpent(task))}</td></tr>)}{!filteredTasks.length && <tr><td colSpan={6} className="task-v2-empty-row">No matching tasks.</td></tr>}</tbody></table></div>
      ) : view === 'gantt' ? (
        <div className="task-v2-gantt"><div className="gantt-head"><div>Task</div><div className="gantt-dates" style={{ gridTemplateColumns: `repeat(${gantt.days}, minmax(42px, 1fr))` }}>{gantt.labels.map((day) => <span key={day.toISOString()} className={sameDay(day, new Date()) ? 'today' : ''}>{day.toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>)}</div></div>{gantt.dated.map((task) => { const start = taskStart(task) || gantt.start; const end = taskEnd(task) || start; const startIndex = Math.max(0, Math.floor((startOfDay(start).getTime() - gantt.start.getTime()) / 86_400_000)); const endIndex = Math.min(gantt.days - 1, Math.max(startIndex, Math.floor((startOfDay(end).getTime() - gantt.start.getTime()) / 86_400_000))); return <div className="gantt-row" key={task.id} onClick={() => setSelectedTaskId(task.id)}><div><strong>{task.name}</strong><small>{task.responsibleName}</small></div><div className="gantt-track" style={{ '--days': gantt.days } as React.CSSProperties}><span className={`gantt-bar status-${task.status}`} style={{ left: `${(startIndex / gantt.days) * 100}%`, width: `${((endIndex - startIndex + 1) / gantt.days) * 100}%` }}>{endIndex - startIndex > 2 ? task.name : ''}</span></div></div>; })}{!gantt.dated.length && <div className="task-v2-empty">No dated tasks to plot.</div>}</div>
      ) : (
        <div className="task-v2-calendar"><header><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft size={17}/></button><strong>{calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</strong><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight size={17}/></button></header><div className="calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day) => { const tasks = filteredTasks.filter((task) => { const due = parseDate(task.deadline) || parseDate(task.planEndDate); return !!due && sameDay(due, day); }); const outside = day.getMonth() !== calendarMonth.getMonth(); return <div className={`calendar-day ${outside ? 'outside' : ''} ${sameDay(day, new Date()) ? 'today' : ''}`} key={day.toISOString()}><b>{day.getDate()}</b>{tasks.slice(0, 4).map((task) => <button key={task.id} className={`cal-task s${task.status}`} onClick={() => setSelectedTaskId(task.id)}>{task.name}</button>)}{tasks.length > 4 && <small>+{tasks.length - 4} more</small>}</div>; })}</div></div>
      )}

      {selectedTask && <div className="task-v2-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTaskId(null)}><aside className="task-v2-drawer"><header><div><small>Task #{selectedTask.id}</small><h2>{selectedTask.name}</h2></div><button onClick={() => setSelectedTaskId(null)}><X size={19}/></button></header><div className="task-v2-timer"><div><small>Time spent</small><strong>{formatSeconds(taskSpent(selectedTask), true)}</strong></div><div className="timer-actions">{data.currentTimer?.taskId === selectedTask.id ? <><button onClick={() => void timerAction(selectedTask, 'pause')}><Pause size={15}/> Pause</button><button onClick={() => void timerAction(selectedTask, 'stop')}><Square size={14}/> Stop</button></> : <button className="primary" disabled={!data.timerReady || Boolean(data.currentTimer) || selectedTask.status === 5} onClick={() => void timerAction(selectedTask, 'start')}><Play size={15}/> Start Timer</button>}</div></div><div className="task-v2-form"><label>Workflow<select value={editForm.workflowId} onChange={(event) => { const workflowId = Number(event.target.value); const firstStage = data.stages.find((stage) => stage.workflowId === workflowId); setEditForm((current) => ({ ...current, workflowId, workflowStageId: firstStage?.id || 0 })); }}><option value={0}>Default Workflow</option>{data.workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}</select></label>{editForm.workflowId ? <label>Stage<select value={editForm.workflowStageId} onChange={(event) => setEditForm((current) => ({ ...current, workflowStageId: Number(event.target.value) }))}>{data.stages.filter((stage) => stage.workflowId === editForm.workflowId).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label> : <label>Status<select value={selectedTask.status} onChange={(event) => void changeStatus(selectedTask, Number(event.target.value) as FlowluTaskStatus)}>{SYSTEM_COLUMNS.map((column) => <option value={column.systemStatus} key={column.key}>{column.label}</option>)}</select></label>}<label>Responsible<select value={editForm.responsibleId} onChange={(event) => setEditForm((current) => ({ ...current, responsibleId: Number(event.target.value) }))}><option value={0}>Choose user</option>{data.users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label><label>Deadline<input type="datetime-local" value={editForm.deadline} onChange={(event) => setEditForm((current) => ({ ...current, deadline: event.target.value }))}/></label><label>Priority<select value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: Number(event.target.value) as 1 | 2 | 3 }))}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option></select></label><label>Estimated minutes<input type="number" min={0} value={editForm.estimateMinutes} onChange={(event) => setEditForm((current) => ({ ...current, estimateMinutes: Number(event.target.value) }))}/></label><button className="save" disabled={workingId === selectedTask.id} onClick={() => void saveTask()}><CheckCircle2 size={16}/> Save Changes</button></div>{selectedTask.description && <div className="task-v2-description"><small>Description</small><p>{selectedTask.description.replace(/<[^>]*>/g, '')}</p></div>}<div className="task-v2-complete">{selectedTask.status === 5 ? <button onClick={() => void changeStatus(selectedTask, 3)}><RefreshCw size={15}/> Reopen Task</button> : data.currentTimer?.taskId === selectedTask.id ? <button className="complete" onClick={() => void timerAction(selectedTask, 'complete')}><CheckCircle2 size={16}/> Stop Timer & Complete</button> : <button className="complete" onClick={() => void completeTask(selectedTask)}><CheckCircle2 size={16}/> Complete Task</button>}</div></aside></div>}

      {createOpen && <div className="task-v2-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}><aside className="task-v2-drawer"><header><div><small>Tasks</small><h2>Create Task</h2></div><button onClick={() => setCreateOpen(false)}><X size={19}/></button></header><div className="task-v2-form"><label>Task name<input autoFocus value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}/></label><label>Responsible<select value={createForm.responsibleId} onChange={(event) => setCreateForm((current) => ({ ...current, responsibleId: Number(event.target.value) }))}><option value={0}>Choose user</option>{data.users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label><label>Workflow<select value={createForm.workflowId} onChange={(event) => { const workflowId = Number(event.target.value); const firstStage = data.stages.find((stage) => stage.workflowId === workflowId); setCreateForm((current) => ({ ...current, workflowId, workflowStageId: firstStage?.id || 0 })); }}><option value={0}>Default Workflow</option>{data.workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}</select></label>{createForm.workflowId > 0 && <label>Stage<select value={createForm.workflowStageId} onChange={(event) => setCreateForm((current) => ({ ...current, workflowStageId: Number(event.target.value) }))}>{data.stages.filter((stage) => stage.workflowId === createForm.workflowId).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>}<label>Deadline<input type="datetime-local" value={createForm.deadline} onChange={(event) => setCreateForm((current) => ({ ...current, deadline: event.target.value }))}/></label><label>Priority<select value={createForm.priority} onChange={(event) => setCreateForm((current) => ({ ...current, priority: Number(event.target.value) as 1 | 2 | 3 }))}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option></select></label><label>Estimated minutes<input type="number" min={0} value={createForm.estimateMinutes} onChange={(event) => setCreateForm((current) => ({ ...current, estimateMinutes: Number(event.target.value) }))}/></label><label>Description<textarea rows={4} value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}/></label><button className="save" disabled={workingId === -1} onClick={() => void createTask()}><Plus size={16}/> {workingId === -1 ? 'Creating…' : 'Create Task'}</button></div></aside></div>}
    </section>
  );
}
