import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Columns3,
  Filter,
  Flag,
  History,
  ListTodo,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  TimerReset,
  UserRound,
  X,
} from 'lucide-react';
import {
  createFlowluBoardTask,
  getFlowluTaskTimerHistory,
  getFlowluTasks,
  runFlowluTaskTimer,
  updateFlowluBoardTask,
  type FlowluTask,
  type FlowluTaskBoardResponse,
  type FlowluTaskStage,
  type FlowluTaskStatus,
  type FlowluTaskTimerSession,
} from '../lib/flowluTasks';
import './FlowluTasksBoard.css';

type TaskTab = 'board' | 'list' | 'history';
type QuickFilter = 'all' | 'today' | 'no-deadline' | 'overdue';

type BoardColumn = {
  key: string;
  label: string;
  systemStatus: FlowluTaskStatus;
  stageId?: number;
  className: string;
};

const SYSTEM_COLUMNS: BoardColumn[] = [
  { key: 'system-1', label: 'New', systemStatus: 1, className: 'new' },
  { key: 'system-3', label: 'In Progress', systemStatus: 3, className: 'progressing' },
  { key: 'system-4', label: 'Review', systemStatus: 4, className: 'review' },
  { key: 'system-5', label: 'Completed', systemStatus: 5, className: 'completed' },
];

const EMPTY_BOARD: FlowluTaskBoardResponse = {
  tasks: [],
  users: [],
  workflows: [],
  stages: [],
  timerReady: true,
  sessions: [],
  totalsByTask: {},
  runningByTask: {},
  currentTimer: null,
  syncedAt: '',
};

function parseDate(value: string) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: string) {
  const date = parseDate(value);
  if (!date) return 'No deadline';
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dateTimeInput(value: string) {
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
  if (withSeconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  }
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${seconds}s`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'T';
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function runningSeconds(session: FlowluTaskTimerSession | undefined | null, nowMs: number) {
  if (!session) return 0;
  if (session.endedAt) return session.durationSeconds;
  const started = new Date(session.startedAt).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

function priorityLabel(priority: number) {
  if (priority === 3) return 'High';
  if (priority === 1) return 'Low';
  return 'Medium';
}

function statusLabel(status: FlowluTaskStatus) {
  return SYSTEM_COLUMNS.find((column) => column.systemStatus === status)?.label || 'Task';
}

function columnClass(index: number, status: FlowluTaskStatus) {
  if (status === 5) return 'completed';
  if (status === 4) return 'review';
  if (status === 3) return index % 2 ? 'progressing' : 'progressing-alt';
  return index % 2 ? 'new-alt' : 'new';
}

export function FlowluTasksBoard() {
  const [data, setData] = useState<FlowluTaskBoardResponse>(EMPTY_BOARD);
  const [tab, setTab] = useState<TaskTab>('board');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [assigneeId, setAssigneeId] = useState(0);
  const [priority, setPriority] = useState(0);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem('flowlu_task_workflow_id') || 0) || 0;
  });
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [history, setHistory] = useState<FlowluTaskTimerSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [createForm, setCreateForm] = useState({
    name: '',
    responsibleId: 0,
    deadline: '',
    description: '',
    priority: 2 as 1 | 2 | 3,
    estimateMinutes: 30,
    workflowId: 0,
    workflowStageId: 0,
  });
  const [editForm, setEditForm] = useState({
    responsibleId: 0,
    deadline: '',
    priority: 2 as 1 | 2 | 3,
    estimateMinutes: 0,
    workflowId: 0,
    workflowStageId: 0,
  });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const next = await getFlowluTasks({ includeCompleted: true });
      setData({ ...EMPTY_BOARD, ...next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Flowlu tasks.');
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
    const clock = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (selectedWorkflowId && !data.workflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(0);
      window.localStorage.removeItem('flowlu_task_workflow_id');
    }
  }, [data.workflows, selectedWorkflowId]);

  useEffect(() => {
    if (tab !== 'history' || !data.timerReady) return;
    setHistoryLoading(true);
    void getFlowluTaskTimerHistory()
      .then((response) => setHistory(response.sessions))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load timer history.'))
      .finally(() => setHistoryLoading(false));
  }, [tab, data.timerReady]);

  const selectedTask = useMemo(
    () => data.tasks.find((task) => task.id === selectedTaskId) || null,
    [data.tasks, selectedTaskId],
  );

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

  const selectedWorkflow = data.workflows.find((workflow) => workflow.id === selectedWorkflowId) || null;
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
      className: columnClass(index, stage.systemStatus),
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
        if (!due || !isSameDay(due, today)) return false;
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
      if (!task.deadline && task.status !== 5) noDeadline += 1;
      const due = parseDate(task.deadline);
      if (due && isSameDay(due, today) && task.status !== 5) dueToday += 1;
      if (task.overdue) overdue += 1;
    }
    return { dueToday, noDeadline, overdue };
  }, [data.tasks, selectedWorkflowId]);

  const taskSpent = useCallback((task: FlowluTask) => {
    const tracked = Number(data.totalsByTask[String(task.id)] || 0)
      + runningSeconds(data.runningByTask[String(task.id)], tick);
    return Math.max(task.timeSpent, tracked);
  }, [data.totalsByTask, data.runningByTask, tick]);

  const taskStageName = (task: FlowluTask) => {
    if (task.workflowStageId) {
      return data.stages.find((stage) => stage.id === task.workflowStageId)?.name || statusLabel(task.status);
    }
    return statusLabel(task.status);
  };

  const changeStatus = async (task: FlowluTask, status: FlowluTaskStatus) => {
    setWorkingId(task.id);
    setError('');
    setNotice('');
    try {
      await updateFlowluBoardTask({ id: task.id, status });
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update task.');
    } finally {
      setWorkingId(null);
    }
  };

  const changeStage = async (task: FlowluTask, stage: FlowluTaskStage) => {
    setWorkingId(task.id);
    setError('');
    try {
      await updateFlowluBoardTask({
        id: task.id,
        workflowId: stage.workflowId,
        workflowStageId: stage.id,
        status: stage.systemStatus,
      });
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to move task to this stage.');
    } finally {
      setWorkingId(null);
    }
  };

  const timerAction = async (task: FlowluTask, action: 'start' | 'pause' | 'stop' | 'complete') => {
    setWorkingId(task.id);
    setError('');
    setNotice('');
    try {
      const result = await runFlowluTaskTimer({
        taskId: task.id,
        taskName: task.name,
        timerAction: action,
      });
      if (result.flowluSyncWarning) {
        setNotice(`Timer saved. Flowlu time sync warning: ${result.flowluSyncWarning}`);
      }
      await load(true);
      if (tab === 'history') {
        const response = await getFlowluTaskTimerHistory();
        setHistory(response.sessions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update task timer.');
    } finally {
      setWorkingId(null);
    }
  };

  const saveTaskDetails = async () => {
    if (!selectedTask) return;
    setWorkingId(selectedTask.id);
    setError('');
    setNotice('');
    try {
      const selectedStage = data.stages.find((stage) => stage.id === editForm.workflowStageId);
      await updateFlowluBoardTask({
        id: selectedTask.id,
        responsibleId: editForm.responsibleId || undefined,
        deadline: editForm.deadline || undefined,
        priority: editForm.priority,
        timeEstimateSeconds: Math.max(0, Number(editForm.estimateMinutes || 0)) * 60,
        workflowId: editForm.workflowId || null,
        workflowStageId: editForm.workflowStageId || null,
        status: selectedStage?.systemStatus,
      });
      setNotice('Task updated in Flowlu.');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save task changes.');
    } finally {
      setWorkingId(null);
    }
  };

  const createTask = async () => {
    if (!createForm.name.trim()) return setError('Enter a task name.');
    if (!createForm.responsibleId) return setError('Choose a responsible Flowlu user.');
    setWorkingId(-1);
    setError('');
    try {
      await createFlowluBoardTask({
        name: createForm.name,
        responsibleId: createForm.responsibleId,
        deadline: createForm.deadline || undefined,
        description: createForm.description || undefined,
        priority: createForm.priority,
        timeEstimateSeconds: Math.max(0, Number(createForm.estimateMinutes || 0)) * 60,
        workflowId: createForm.workflowId || undefined,
        workflowStageId: createForm.workflowStageId || undefined,
      });
      setCreateOpen(false);
      setCreateForm((current) => ({
        name: '',
        responsibleId: current.responsibleId,
        deadline: '',
        description: '',
        priority: 2,
        estimateMinutes: 30,
        workflowId: selectedWorkflowId,
        workflowStageId: workflowStages[0]?.id || 0,
      }));
      setNotice('Task created in Flowlu.');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create Flowlu task.');
    } finally {
      setWorkingId(null);
    }
  };

  const openCreate = () => {
    setCreateForm((current) => ({
      ...current,
      workflowId: selectedWorkflowId,
      workflowStageId: workflowStages[0]?.id || 0,
    }));
    setCreateOpen(true);
  };

  const chooseWorkflow = (workflowId: number) => {
    setSelectedWorkflowId(workflowId);
    if (workflowId) window.localStorage.setItem('flowlu_task_workflow_id', String(workflowId));
    else window.localStorage.removeItem('flowlu_task_workflow_id');
    setQuickFilter('all');
  };

  const currentTimerTask = data.currentTimer
    ? data.tasks.find((task) => task.id === data.currentTimer?.taskId)
    : null;

  const selectedSessions = selectedTask
    ? data.sessions.filter((session) => session.taskId === selectedTask.id).slice(0, 20)
    : [];

  const historySummary = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - ((now.getDay() + 6) % 7) * 86_400_000;
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const totals = { today: 0, week: 0, month: 0 };
    for (const session of history) {
      const started = new Date(session.startedAt).getTime();
      const duration = session.endedAt ? session.durationSeconds : runningSeconds(session, tick);
      if (started >= startToday) totals.today += duration;
      if (started >= startWeek) totals.week += duration;
      if (started >= startMonth) totals.month += duration;
    }
    return totals;
  }, [history, tick]);

  const completeTask = async (task: FlowluTask) => {
    const completedStage = task.workflowId
      ? data.stages.find((stage) => stage.workflowId === task.workflowId && stage.systemStatus === 5)
      : undefined;
    if (completedStage) return changeStage(task, completedStage);
    return changeStatus(task, 5);
  };

  const reopenTask = async (task: FlowluTask) => {
    const reopenStage = task.workflowId
      ? data.stages.find((stage) => stage.workflowId === task.workflowId && [3, 1].includes(stage.systemStatus))
      : undefined;
    if (reopenStage) return changeStage(task, reopenStage);
    return changeStatus(task, 3);
  };

  const boardTaskMatchesColumn = (task: FlowluTask, column: BoardColumn) => (
    column.stageId ? task.workflowStageId === column.stageId : task.status === column.systemStatus
  );

  return (
    <section className="flowlu-tasks-page">
      <div className="flowlu-task-head">
        <div className="flowlu-title-stack">
          <h1>Tasks</h1>
          <div className="flowlu-task-tabs" role="tablist">
            <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>
              Kanban Board
            </button>
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
              List
            </button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              Time History
            </button>
          </div>
        </div>

        <label className="flowlu-workflow-picker" title="Choose the Flowlu task workflow shown on this board">
          <span>Workflow</span>
          <select value={selectedWorkflowId} onChange={(event) => chooseWorkflow(Number(event.target.value))}>
            <option value={0}>Common Kanban</option>
            {data.workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
            ))}
          </select>
        </label>

        <div className="flowlu-task-head-actions">
          <button className="flowlu-create-btn" onClick={openCreate}>
            <Plus size={18}/> Create
          </button>
          <button className="flowlu-soft-btn" onClick={() => setConfigOpen(true)}>
            Configuration
          </button>
          <button className="flowlu-icon-btn" onClick={() => setConfigOpen(true)} title="Task configuration">
            <Settings2 size={21}/>
          </button>
        </div>
      </div>

      {data.currentTimer && currentTimerTask && (
        <button className="flowlu-running-strip" onClick={() => setSelectedTaskId(currentTimerTask.id)}>
          <span className="flowlu-running-dot"/>
          <div>
            <small>Running now</small>
            <strong>{currentTimerTask.name}</strong>
          </div>
          <b>{formatSeconds(runningSeconds(data.currentTimer, tick), true)}</b>
          <span>Open task →</span>
        </button>
      )}

      {!data.timerReady && (
        <div className="flowlu-timer-setup-warning">
          <AlertCircle size={17}/>
          <span>Flowlu tasks are connected. Timer History needs migration 005 before Start / Pause / Stop can be used.</span>
        </div>
      )}

      {error && <div className="flowlu-task-alert error"><AlertCircle size={17}/>{error}</div>}
      {notice && <div className="flowlu-task-alert success"><CheckCircle2 size={17}/>{notice}</div>}

      {tab !== 'history' && (
        <>
          <div className="flowlu-task-toolbar">
            <label className="flowlu-task-search">
              <Search size={19}/>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search"/>
            </label>
            <button className="flowlu-filter-icon" title="Filters"><Filter size={20}/></button>
            <button className="flowlu-add-quick" onClick={openCreate} title="Create task"><Plus size={25}/></button>
            <div className="flowlu-toolbar-spacer"/>
            <select value={assigneeId} onChange={(event) => setAssigneeId(Number(event.target.value))}>
              <option value={0}>All assignees</option>
              {data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>
              <option value={0}>All priorities</option>
              <option value={3}>High priority</option>
              <option value={2}>Medium priority</option>
              <option value={1}>Low priority</option>
            </select>
            {(assigneeId || priority || quickFilter !== 'all' || query) ? (
              <button className="flowlu-clear-filters" onClick={() => {
                setQuery('');
                setAssigneeId(0);
                setPriority(0);
                setQuickFilter('all');
              }}>Clear</button>
            ) : null}
          </div>

          <div className="flowlu-task-chips">
            <button className={quickFilter === 'today' ? 'active' : ''} onClick={() => setQuickFilter(quickFilter === 'today' ? 'all' : 'today')}>
              <b className="blue">{counters.dueToday}</b> Today's Tasks
            </button>
            <button className={quickFilter === 'no-deadline' ? 'active' : ''} onClick={() => setQuickFilter(quickFilter === 'no-deadline' ? 'all' : 'no-deadline')}>
              <b className="amber">{counters.noDeadline}</b> No Deadline
            </button>
            <button className={quickFilter === 'overdue' ? 'active' : ''} onClick={() => setQuickFilter(quickFilter === 'overdue' ? 'all' : 'overdue')}>
              <b className="red">{counters.overdue}</b> Overdue
            </button>
            <span className="flowlu-result-count">{filteredTasks.length} matching tasks</span>
          </div>
        </>
      )}

      {loading && !data.tasks.length ? (
        <div className="flowlu-task-loading">Loading Flowlu tasks…</div>
      ) : tab === 'board' ? (
        <div className="flowlu-kanban">
          {columns.map((column) => {
            const tasks = filteredTasks.filter((task) => boardTaskMatchesColumn(task, column));
            return (
              <section className={`flowlu-kanban-column ${column.className}`} key={column.key}>
                <header>
                  <div>
                    <strong>{column.label}</strong>
                    <span>{tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}</span>
                  </div>
                  <b>{formatSeconds(tasks.reduce((sum, task) => sum + taskSpent(task), 0))}</b>
                </header>
                <div className="flowlu-kanban-cards">
                  {tasks.map((task) => {
                    const running = data.runningByTask[String(task.id)];
                    const spent = taskSpent(task);
                    return (
                      <article
                        key={task.id}
                        className={`flowlu-task-card ${task.overdue ? 'overdue' : ''} ${running ? 'running' : ''}`}
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <div className="flowlu-card-title-row">
                          <h3>{task.name}</h3>
                          {task.priority === 3 && <Flag size={15} className="priority-high"/>}
                        </div>
                        {task.description && <p>{task.description.replace(/<[^>]*>/g, '').slice(0, 105)}</p>}
                        <div className="flowlu-card-lower">
                          <div className="flowlu-card-person">
                            <span className="flowlu-avatar">{initials(task.responsibleName)}</span>
                            <span>{task.responsibleName}</span>
                          </div>
                          <div className="flowlu-card-meta">
                            <span className={task.overdue ? 'deadline overdue' : 'deadline'}>
                              <CalendarDays size={14}/>{dateLabel(task.deadline)}
                            </span>
                            <span><Clock3 size={14}/>{formatSeconds(spent)}</span>
                          </div>
                        </div>
                        {task.timeEstimate > 0 && (
                          <div className="flowlu-time-progress">
                            <span style={{ width: `${Math.min(100, (spent / task.timeEstimate) * 100)}%` }}/>
                          </div>
                        )}
                        <footer>
                          <small>{priorityLabel(task.priority)} priority</small>
                          {running ? (
                            <strong className="flowlu-live-time"><span/> {formatSeconds(runningSeconds(running, tick), true)}</strong>
                          ) : (
                            <span>#{task.id}</span>
                          )}
                        </footer>
                      </article>
                    );
                  })}
                  {!tasks.length && <div className="flowlu-empty-column">No tasks</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : tab === 'list' ? (
        <div className="flowlu-task-list-wrap">
          <table className="flowlu-task-list">
            <thead>
              <tr>
                <th>Task</th><th>Stage</th><th>Assignee</th><th>Deadline</th><th>Priority</th><th>Time Spent</th><th/>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                  <td><strong>{task.name}</strong><small>#{task.id}</small></td>
                  <td><span className={`flowlu-status-pill s${task.status}`}>{taskStageName(task)}</span></td>
                  <td><span className="flowlu-person-cell"><span className="flowlu-avatar">{initials(task.responsibleName)}</span>{task.responsibleName}</span></td>
                  <td className={task.overdue ? 'overdue-text' : ''}>{dateLabel(task.deadline)}</td>
                  <td>{priorityLabel(task.priority)}</td>
                  <td>{formatSeconds(taskSpent(task))}</td>
                  <td>›</td>
                </tr>
              ))}
              {!filteredTasks.length && <tr><td colSpan={7} className="flowlu-empty-list">No matching tasks.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flowlu-history-view">
          <div className="flowlu-history-summary">
            <div><small>Today</small><strong>{formatSeconds(historySummary.today)}</strong></div>
            <div><small>This Week</small><strong>{formatSeconds(historySummary.week)}</strong></div>
            <div><small>This Month</small><strong>{formatSeconds(historySummary.month)}</strong></div>
            <div><small>Sessions</small><strong>{history.length}</strong></div>
          </div>
          {historyLoading ? (
            <div className="flowlu-task-loading">Loading timer history…</div>
          ) : !data.timerReady ? (
            <div className="flowlu-history-empty">Timer History is waiting for migration 005_flowlu_task_timer_sessions.sql.</div>
          ) : (
            <div className="flowlu-task-list-wrap">
              <table className="flowlu-task-list history-table">
                <thead><tr><th>Task</th><th>User</th><th>Started</th><th>Ended</th><th>Duration</th><th>Action</th></tr></thead>
                <tbody>
                  {history.map((session) => (
                    <tr key={session.id} onClick={() => setSelectedTaskId(session.taskId)}>
                      <td><strong>{session.taskName}</strong><small>#{session.taskId}</small></td>
                      <td>{session.staffName}</td>
                      <td>{new Date(session.startedAt).toLocaleString()}</td>
                      <td>{session.endedAt ? new Date(session.endedAt).toLocaleString() : <span className="running-history">Running</span>}</td>
                      <td>{formatSeconds(session.endedAt ? session.durationSeconds : runningSeconds(session, tick), true)}</td>
                      <td><span className={`history-action ${session.endAction || 'running'}`}>{session.endAction || 'running'}</span></td>
                    </tr>
                  ))}
                  {!history.length && <tr><td colSpan={6} className="flowlu-empty-list">No timer sessions yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedTask && (
        <div className="flowlu-drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedTaskId(null);
        }}>
          <aside className="flowlu-task-drawer">
            <div className="flowlu-drawer-head">
              <div>
                <small>Flowlu Task #{selectedTask.id}</small>
                <h2>{selectedTask.name}</h2>
              </div>
              <button onClick={() => setSelectedTaskId(null)}><X size={20}/></button>
            </div>

            <div className="flowlu-task-timer-box">
              <div>
                <small>Time spent</small>
                <strong>{formatSeconds(taskSpent(selectedTask), true)}</strong>
                {selectedTask.timeEstimate > 0 && <span>of {formatSeconds(selectedTask.timeEstimate)} estimated</span>}
              </div>
              {data.currentTimer?.taskId === selectedTask.id ? (
                <b className="drawer-live-time">{formatSeconds(runningSeconds(data.currentTimer, tick), true)}</b>
              ) : null}
              <div className="flowlu-timer-actions">
                {data.currentTimer?.taskId === selectedTask.id ? (
                  <>
                    <button onClick={() => void timerAction(selectedTask, 'pause')} disabled={workingId === selectedTask.id}><Pause size={16}/> Pause</button>
                    <button onClick={() => void timerAction(selectedTask, 'stop')} disabled={workingId === selectedTask.id}><Square size={15}/> Stop</button>
                  </>
                ) : (
                  <button
                    className="primary"
                    onClick={() => void timerAction(selectedTask, 'start')}
                    disabled={!data.timerReady || Boolean(data.currentTimer) || workingId === selectedTask.id || selectedTask.status === 5}
                    title={!data.timerReady ? 'Timer storage is not configured.' : data.currentTimer ? 'Stop the currently running timer first.' : ''}
                  ><Play size={16}/> Start Timer</button>
                )}
              </div>
            </div>

            <div className="flowlu-drawer-fields">
              <label>Workflow
                <select value={editForm.workflowId} onChange={(event) => {
                  const nextWorkflowId = Number(event.target.value);
                  const firstStage = data.stages.find((stage) => stage.workflowId === nextWorkflowId);
                  setEditForm((current) => ({ ...current, workflowId: nextWorkflowId, workflowStageId: firstStage?.id || 0 }));
                }}>
                  <option value={0}>Common Kanban</option>
                  {data.workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}
                </select>
              </label>
              {editForm.workflowId ? (
                <label>Stage
                  <select value={editForm.workflowStageId} onChange={(event) => setEditForm((current) => ({ ...current, workflowStageId: Number(event.target.value) }))}>
                    <option value={0}>Choose stage</option>
                    {data.stages.filter((stage) => stage.workflowId === editForm.workflowId).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                  </select>
                </label>
              ) : (
                <label>Status
                  <select value={selectedTask.status} onChange={(event) => void changeStatus(selectedTask, Number(event.target.value) as FlowluTaskStatus)} disabled={workingId === selectedTask.id}>
                    {SYSTEM_COLUMNS.map((status) => <option value={status.systemStatus} key={status.key}>{status.label}</option>)}
                  </select>
                </label>
              )}
              <label>Responsible
                <select value={editForm.responsibleId} onChange={(event) => setEditForm((current) => ({ ...current, responsibleId: Number(event.target.value) }))}>
                  <option value={0}>Choose user</option>
                  {data.users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
                </select>
              </label>
              <label>Deadline
                <input type="datetime-local" value={editForm.deadline} onChange={(event) => setEditForm((current) => ({ ...current, deadline: event.target.value }))}/>
              </label>
              <label>Priority
                <select value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: Number(event.target.value) as 1 | 2 | 3 }))}>
                  <option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option>
                </select>
              </label>
              <label>Estimated time (minutes)
                <input type="number" min={0} value={editForm.estimateMinutes} onChange={(event) => setEditForm((current) => ({ ...current, estimateMinutes: Number(event.target.value) }))}/>
              </label>
              <button className="flowlu-save-task" onClick={() => void saveTaskDetails()} disabled={workingId === selectedTask.id}>
                <Check size={16}/> Save Changes
              </button>
            </div>

            {selectedTask.description && (
              <div className="flowlu-task-description">
                <small>Description</small>
                <p>{selectedTask.description.replace(/<[^>]*>/g, '')}</p>
              </div>
            )}

            <div className="flowlu-drawer-history">
              <div className="flowlu-drawer-section-title"><TimerReset size={17}/><b>Time History</b></div>
              {!data.timerReady ? (
                <p className="flowlu-muted">Timer storage needs setup.</p>
              ) : selectedSessions.length ? (
                selectedSessions.map((session) => (
                  <div className="flowlu-session-row" key={session.id}>
                    <span className="flowlu-avatar small">{initials(session.staffName)}</span>
                    <div>
                      <b>{session.staffName}</b>
                      <span>{new Date(session.startedAt).toLocaleString()} → {session.endedAt ? new Date(session.endedAt).toLocaleTimeString() : 'Running'}</span>
                    </div>
                    <strong>{formatSeconds(session.endedAt ? session.durationSeconds : runningSeconds(session, tick), true)}</strong>
                  </div>
                ))
              ) : (
                <p className="flowlu-muted">No timer history for this task yet.</p>
              )}
            </div>

            <div className="flowlu-complete-row">
              {selectedTask.status !== 5 ? (
                data.currentTimer?.taskId === selectedTask.id ? (
                  <button className="complete" onClick={() => void timerAction(selectedTask, 'complete')} disabled={workingId === selectedTask.id}><CheckCircle2 size={17}/> Stop Timer & Complete Task</button>
                ) : (
                  <button className="complete" onClick={() => void completeTask(selectedTask)} disabled={workingId === selectedTask.id}><CheckCircle2 size={17}/> Complete Task</button>
                )
              ) : (
                <button onClick={() => void reopenTask(selectedTask)} disabled={workingId === selectedTask.id}><RefreshCw size={16}/> Reopen Task</button>
              )}
            </div>
          </aside>
        </div>
      )}

      {createOpen && (
        <div className="flowlu-drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCreateOpen(false);
        }}>
          <aside className="flowlu-task-drawer create-drawer">
            <div className="flowlu-drawer-head">
              <div><small>Flowlu Tasks</small><h2>Create Task</h2></div>
              <button onClick={() => setCreateOpen(false)}><X size={20}/></button>
            </div>
            <div className="flowlu-create-form">
              <label>Task name *
                <input autoFocus value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Call client for site visit"/>
              </label>
              <label>Responsible *
                <select value={createForm.responsibleId} onChange={(event) => setCreateForm((current) => ({ ...current, responsibleId: Number(event.target.value) }))}>
                  <option value={0}>Choose Flowlu user</option>
                  {data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              {data.workflows.length > 0 && (
                <div className="flowlu-create-split">
                  <label>Workflow
                    <select value={createForm.workflowId} onChange={(event) => {
                      const nextWorkflowId = Number(event.target.value);
                      const firstStage = data.stages.find((stage) => stage.workflowId === nextWorkflowId);
                      setCreateForm((current) => ({ ...current, workflowId: nextWorkflowId, workflowStageId: firstStage?.id || 0 }));
                    }}>
                      <option value={0}>Common Kanban</option>
                      {data.workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}
                    </select>
                  </label>
                  <label>Stage
                    <select value={createForm.workflowStageId} disabled={!createForm.workflowId} onChange={(event) => setCreateForm((current) => ({ ...current, workflowStageId: Number(event.target.value) }))}>
                      <option value={0}>{createForm.workflowId ? 'Choose stage' : 'System status'}</option>
                      {data.stages.filter((stage) => stage.workflowId === createForm.workflowId).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <label>Deadline
                <input type="datetime-local" value={createForm.deadline} onChange={(event) => setCreateForm((current) => ({ ...current, deadline: event.target.value }))}/>
              </label>
              <div className="flowlu-create-split">
                <label>Priority
                  <select value={createForm.priority} onChange={(event) => setCreateForm((current) => ({ ...current, priority: Number(event.target.value) as 1 | 2 | 3 }))}>
                    <option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option>
                  </select>
                </label>
                <label>Estimate (minutes)
                  <input type="number" min={0} value={createForm.estimateMinutes} onChange={(event) => setCreateForm((current) => ({ ...current, estimateMinutes: Number(event.target.value) }))}/>
                </label>
              </div>
              <label>Description
                <textarea rows={5} value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} placeholder="Task details, instructions or expected outcome"/>
              </label>
              <button className="flowlu-create-submit" onClick={() => void createTask()} disabled={workingId === -1}>
                <Plus size={17}/>{workingId === -1 ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {configOpen && (
        <div className="flowlu-drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfigOpen(false);
        }}>
          <aside className="flowlu-config-drawer">
            <div className="flowlu-drawer-head">
              <div><small>Flowlu Integration</small><h2>Task Configuration</h2></div>
              <button onClick={() => setConfigOpen(false)}><X size={20}/></button>
            </div>

            <div className="flowlu-config-status-grid">
              <div className="good"><CheckCircle2 size={20}/><span><b>Flowlu API</b><small>Connected</small></span></div>
              <div className={data.timerReady ? 'good' : 'warning'}>
                {data.timerReady ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}<span><b>Timer History</b><small>{data.timerReady ? 'Ready' : 'Setup required'}</small></span>
              </div>
            </div>

            <div className="flowlu-config-section">
              <h3>Flowlu Workflows</h3>
              <p>The board reads task workflows and stages directly from Flowlu. Configure or rename them in Flowlu and refresh this page.</p>
              <div className="flowlu-config-metrics">
                <div><strong>{data.workflows.length}</strong><span>Workflows</span></div>
                <div><strong>{data.stages.length}</strong><span>Stages</span></div>
                <div><strong>{data.users.length}</strong><span>Active users</span></div>
              </div>
              {data.workflows.length ? (
                <div className="flowlu-workflow-list">
                  {data.workflows.map((workflow) => (
                    <button key={workflow.id} onClick={() => { chooseWorkflow(workflow.id); setConfigOpen(false); }}>
                      <span><b>{workflow.name}</b><small>{data.stages.filter((stage) => stage.workflowId === workflow.id).length} stages</small></span>
                      <span>Use board →</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flowlu-config-note">No custom task workflows were returned by the Flowlu API. The Common Kanban remains available.</div>
              )}
            </div>

            <div className="flowlu-config-section">
              <h3>Timer storage</h3>
              {data.timerReady ? (
                <div className="flowlu-config-note success">Supabase timer history is available. Start, Pause, Stop and history are enabled.</div>
              ) : (
                <div className="flowlu-config-note warning">Run <code>005_flowlu_task_timer_sessions.sql</code> in Supabase SQL Editor. The board works without it, but timer controls stay disabled.</div>
              )}
            </div>

            <div className="flowlu-config-section">
              <h3>Connection security</h3>
              <p>Flowlu account code, API key and webhook secret are stored only as Vercel server environment variables. They are not sent to the browser.</p>
              <div className="flowlu-config-sync"><RefreshCw size={15}/><span>Last task sync: {data.syncedAt ? new Date(data.syncedAt).toLocaleString() : 'Not synced yet'}</span></div>
              <button className="flowlu-config-refresh" onClick={() => void load()}><RefreshCw size={16}/> Refresh configuration</button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
