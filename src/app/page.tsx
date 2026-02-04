'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const SITE_PASSWORD = 'timer';
const LEETCODE_TOTAL_SECONDS = 2 * 60 * 60; // 2 hours
const SUPABASE_SAVE_INTERVAL = 5000; // 5 seconds

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface LeetcodeState {
  remainingSeconds: number;
  isRunning: boolean;
  lastDate: string;
}

interface StopwatchState {
  elapsedSeconds: number;
  isRunning: boolean;
  lastDate: string;
}

function loadLeetcodeState(): LeetcodeState {
  try {
    const raw = localStorage.getItem('leetcodeState');
    if (raw) {
      const parsed = JSON.parse(raw) as LeetcodeState;
      if (parsed.lastDate === getTodayString()) {
        return { ...parsed, isRunning: false };
      }
    }
  } catch {}
  return { remainingSeconds: LEETCODE_TOTAL_SECONDS, isRunning: false, lastDate: getTodayString() };
}

function loadStopwatchState(key: string): StopwatchState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as StopwatchState;
      if (parsed.lastDate === getTodayString()) {
        return { ...parsed, isRunning: false };
      }
    }
  } catch {}
  return { elapsedSeconds: 0, isRunning: false, lastDate: getTodayString() };
}

function loadCompletedDates(): Set<string> {
  try {
    const raw = localStorage.getItem('leetcodeCompletedDates');
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function saveCompletedDates(dates: Set<string>) {
  localStorage.setItem('leetcodeCompletedDates', JSON.stringify([...dates]));
}

// ─── Supabase helpers ───

async function supabaseFetchTimerState(date: string) {
  const { data } = await supabase
    .from('timer_state')
    .select('*')
    .eq('date', date)
    .single();
  return data as { date: string; leetcode_remaining_seconds: number; project_elapsed_seconds: number; study_elapsed_seconds: number; app_elapsed_seconds: number } | null;
}

async function supabaseUpsertTimerState(date: string, leetcodeRemaining: number, projectElapsed: number, studyElapsed: number, appElapsed: number) {
  const { error } = await supabase
    .from('timer_state')
    .upsert({
      date,
      leetcode_remaining_seconds: leetcodeRemaining,
      project_elapsed_seconds: projectElapsed,
      study_elapsed_seconds: studyElapsed,
      app_elapsed_seconds: appElapsed,
    }, { onConflict: 'date' });
  if (error) console.error('supabase upsert error:', error);
}

async function supabaseInsertCompleted(date: string) {
  const { error } = await supabase
    .from('completed_dates')
    .upsert({ date }, { onConflict: 'date' });
  if (error) console.error('supabase completed upsert error:', error);
}

async function supabaseFetchAllTimerStates() {
  const { data } = await supabase
    .from('timer_state')
    .select('*')
    .order('date', { ascending: true });
  return (data ?? []) as { date: string; leetcode_remaining_seconds: number; project_elapsed_seconds: number; study_elapsed_seconds: number; app_elapsed_seconds: number }[];
}

async function supabaseFetchCompletedDates(): Promise<string[]> {
  const { data } = await supabase
    .from('completed_dates')
    .select('date');
  return (data ?? []).map((r: { date: string }) => r.date);
}

// ─── Daily Chart Component ───

function DailyChart({ data }: { data: { date: string; totalHours: number }[] }) {
  if (data.length === 0) return null;

  const W = 500;
  const H = 200;
  const PAD_L = 40;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 40;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxHours = Math.max(...data.map((d) => d.totalHours), 1);
  const yMax = Math.ceil(maxHours);

  const points = data.map((d, i) => {
    const x = PAD_L + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = PAD_T + chartH - (d.totalHours / yMax) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_T + chartH} L${points[0].x},${PAD_T + chartH} Z`;

  const yTicks = [];
  const tickCount = Math.min(yMax, 4);
  for (let i = 0; i <= tickCount; i++) {
    const val = (yMax / tickCount) * i;
    const y = PAD_T + chartH - (val / yMax) * chartH;
    yTicks.push({ val, y });
  }

  return (
    <div className="glass-card p-4 w-full mt-4">
      <h3 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3 text-center">Daily Hours (Last 14 Days)</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(79,172,254,0.4)" />
            <stop offset="100%" stopColor="rgba(79,172,254,0)" />
          </linearGradient>
        </defs>
        {/* Grid lines + Y labels */}
        {yTicks.map((t) => (
          <g key={t.val}>
            <line x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={PAD_L - 6} y={t.y + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={10}>
              {t.val % 1 === 0 ? t.val : t.val.toFixed(1)}h
            </text>
          </g>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="rgba(79,172,254,0.8)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {points.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r={3} fill="#4facfe" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
        ))}
        {/* X labels */}
        {points.map((p, i) => {
          // Show every label if <=7, otherwise every other
          if (data.length > 7 && i % 2 !== 0 && i !== data.length - 1) return null;
          const label = p.date.slice(5); // MM-DD
          return (
            <text key={p.date} x={p.x} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Calendar Component ───

function Calendar({ completedDates }: { completedDates: Set<string> }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(getTodayString());
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="glass-card p-4 w-full">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="glass-button px-2 py-1 text-xs">&larr;</button>
        <h3 className="text-white/90 font-semibold text-sm">{monthName}</h3>
        <button onClick={nextMonth} className="glass-button px-2 py-1 text-xs">&rarr;</button>
      </div>
      <div className="calendar-grid">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="calendar-header">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isCompleted = completedDates.has(dateStr);
          const isToday = dateStr === today;
          return (
            <div
              key={dateStr}
              className={`calendar-day${isCompleted ? ' calendar-day-completed' : ''}${isToday ? ' calendar-day-today' : ''}`}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Leetcode countdown
  const [lcRemaining, setLcRemaining] = useState(LEETCODE_TOTAL_SECONDS);
  const [lcRunning, setLcRunning] = useState(false);
  const lcInterval = useRef<NodeJS.Timeout | null>(null);
  const lcStartedAt = useRef<number>(0); // timestamp when started
  const lcBaseRemaining = useRef<number>(LEETCODE_TOTAL_SECONDS); // remaining at start

  // Project stopwatch
  const [projElapsed, setProjElapsed] = useState(0);
  const [projRunning, setProjRunning] = useState(false);
  const projInterval = useRef<NodeJS.Timeout | null>(null);
  const projStartedAt = useRef<number>(0);
  const projBaseElapsed = useRef<number>(0);

  // Study stopwatch
  const [studyElapsed, setStudyElapsed] = useState(0);
  const [studyRunning, setStudyRunning] = useState(false);
  const studyInterval = useRef<NodeJS.Timeout | null>(null);
  const studyStartedAt = useRef<number>(0);
  const studyBaseElapsed = useRef<number>(0);

  // Application stopwatch
  const [appElapsed, setAppElapsed] = useState(0);
  const [appRunning, setAppRunning] = useState(false);
  const appInterval = useRef<NodeJS.Timeout | null>(null);
  const appStartedAt = useRef<number>(0);
  const appBaseElapsed = useRef<number>(0);

  // Calendar
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());

  // Live clock
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Daily chart data
  const [dailyData, setDailyData] = useState<{ date: string; totalHours: number }[]>([]);

  // Hydration guard
  const [mounted, setMounted] = useState(false);

  // Supabase debounce ref
  const lastSupabaseSave = useRef(0);

  // ── Auth ──
  useEffect(() => {
    if (sessionStorage.getItem('authenticated') === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === SITE_PASSWORD) {
      sessionStorage.setItem('authenticated', 'true');
      setIsAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  // ── Live clock ──
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Load state from localStorage first, then sync with Supabase ──
  useEffect(() => {
    const lc = loadLeetcodeState();
    setLcRemaining(lc.remainingSeconds);

    const proj = loadStopwatchState('projectState');
    setProjElapsed(proj.elapsedSeconds);

    const study = loadStopwatchState('studyState');
    setStudyElapsed(study.elapsedSeconds);

    const app = loadStopwatchState('appState');
    setAppElapsed(app.elapsedSeconds);

    const localDates = loadCompletedDates();
    setCompletedDates(localDates);
    setMounted(true);

    // Sync from Supabase in background
    const today = getTodayString();
    supabaseFetchTimerState(today).then((row) => {
      if (row) {
        setLcRemaining(row.leetcode_remaining_seconds);
        setProjElapsed(row.project_elapsed_seconds);
        setStudyElapsed(row.study_elapsed_seconds ?? 0);
        setAppElapsed(row.app_elapsed_seconds ?? 0);
      }
    }).catch(() => {});

    supabaseFetchAllTimerStates().then((rows) => {
      const processed = rows
        .map((r) => {
          const lcSpent = LEETCODE_TOTAL_SECONDS - r.leetcode_remaining_seconds;
          const total = lcSpent + (r.project_elapsed_seconds ?? 0) + (r.study_elapsed_seconds ?? 0) + (r.app_elapsed_seconds ?? 0);
          return { date: r.date, totalHours: total / 3600 };
        })
        .filter((d) => d.totalHours > 0)
        .slice(-14);
      setDailyData(processed);
    }).catch(() => {});

    supabaseFetchCompletedDates().then((dates) => {
      if (dates.length > 0) {
        setCompletedDates((prev) => {
          const merged = new Set(prev);
          dates.forEach((d) => merged.add(d));
          saveCompletedDates(merged);
          return merged;
        });
      }
    }).catch(() => {});
  }, []);

  // ── Persist leetcode state ──
  const saveLeetcode = useCallback((remaining: number, running: boolean) => {
    const state: LeetcodeState = { remainingSeconds: remaining, isRunning: running, lastDate: getTodayString() };
    localStorage.setItem('leetcodeState', JSON.stringify(state));
  }, []);

  // ── Persist stopwatch state ──
  const saveStopwatch = useCallback((key: string, elapsed: number, running: boolean) => {
    const state: StopwatchState = { elapsedSeconds: elapsed, isRunning: running, lastDate: getTodayString() };
    localStorage.setItem(key, JSON.stringify(state));
  }, []);

  // ── Debounced Supabase save ──
  const saveToSupabase = useCallback((lcRem: number, projEl: number, studyEl: number, appEl: number) => {
    const now = Date.now();
    if (now - lastSupabaseSave.current >= SUPABASE_SAVE_INTERVAL) {
      lastSupabaseSave.current = now;
      supabaseUpsertTimerState(getTodayString(), lcRem, projEl, studyEl, appEl).catch(() => {});
    }
  }, []);

  // ── Leetcode timer tick ──
  useEffect(() => {
    if (lcRunning) {
      lcStartedAt.current = Date.now();
      lcBaseRemaining.current = lcRemaining;
      lcInterval.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lcStartedAt.current) / 1000);
        const next = lcBaseRemaining.current - elapsed;
        if (next <= 0) {
          setLcRunning(false);
          setLcRemaining(0);
          setCompletedDates((dates) => {
            const updated = new Set(dates);
            const today = getTodayString();
            updated.add(today);
            saveCompletedDates(updated);
            supabaseInsertCompleted(today).catch(() => {});
            return updated;
          });
          saveLeetcode(0, false);
          supabaseUpsertTimerState(getTodayString(), 0, 0, 0, 0).catch(() => {});
        } else {
          setLcRemaining(next);
        }
      }, 1000);
    } else if (lcInterval.current) {
      clearInterval(lcInterval.current);
    }
    return () => {
      if (lcInterval.current) clearInterval(lcInterval.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lcRunning, saveLeetcode]);

  // Save leetcode state when remaining changes
  useEffect(() => {
    if (mounted) {
      saveLeetcode(lcRemaining, lcRunning);
      saveToSupabase(lcRemaining, projElapsed, studyElapsed, appElapsed);
    }
  }, [lcRemaining, lcRunning, mounted, saveLeetcode, saveToSupabase, projElapsed, studyElapsed, appElapsed]);

  // ── Project timer tick ──
  useEffect(() => {
    if (projRunning) {
      projStartedAt.current = Date.now();
      projBaseElapsed.current = projElapsed;
      projInterval.current = setInterval(() => {
        const delta = Math.floor((Date.now() - projStartedAt.current) / 1000);
        setProjElapsed(projBaseElapsed.current + delta);
      }, 1000);
    } else if (projInterval.current) {
      clearInterval(projInterval.current);
    }
    return () => {
      if (projInterval.current) clearInterval(projInterval.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projRunning]);

  // Save project state when elapsed changes
  useEffect(() => {
    if (mounted) {
      saveStopwatch('projectState', projElapsed, projRunning);
      saveToSupabase(lcRemaining, projElapsed, studyElapsed, appElapsed);
    }
  }, [projElapsed, projRunning, mounted, saveStopwatch, saveToSupabase, lcRemaining, studyElapsed, appElapsed]);

  // ── Study timer tick ──
  useEffect(() => {
    if (studyRunning) {
      studyStartedAt.current = Date.now();
      studyBaseElapsed.current = studyElapsed;
      studyInterval.current = setInterval(() => {
        const delta = Math.floor((Date.now() - studyStartedAt.current) / 1000);
        setStudyElapsed(studyBaseElapsed.current + delta);
      }, 1000);
    } else if (studyInterval.current) {
      clearInterval(studyInterval.current);
    }
    return () => {
      if (studyInterval.current) clearInterval(studyInterval.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyRunning]);

  // Save study state when elapsed changes
  useEffect(() => {
    if (mounted) {
      saveStopwatch('studyState', studyElapsed, studyRunning);
      saveToSupabase(lcRemaining, projElapsed, studyElapsed, appElapsed);
    }
  }, [studyElapsed, studyRunning, mounted, saveStopwatch, saveToSupabase, lcRemaining, projElapsed, appElapsed]);

  // ── Application timer tick ──
  useEffect(() => {
    if (appRunning) {
      appStartedAt.current = Date.now();
      appBaseElapsed.current = appElapsed;
      appInterval.current = setInterval(() => {
        const delta = Math.floor((Date.now() - appStartedAt.current) / 1000);
        setAppElapsed(appBaseElapsed.current + delta);
      }, 1000);
    } else if (appInterval.current) {
      clearInterval(appInterval.current);
    }
    return () => {
      if (appInterval.current) clearInterval(appInterval.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRunning]);

  // Save application state when elapsed changes
  useEffect(() => {
    if (mounted) {
      saveStopwatch('appState', appElapsed, appRunning);
      saveToSupabase(lcRemaining, projElapsed, studyElapsed, appElapsed);
    }
  }, [appElapsed, appRunning, mounted, saveStopwatch, saveToSupabase, lcRemaining, projElapsed, studyElapsed]);

  // ── Re-sync timers when tab becomes visible again ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (lcRunning && lcStartedAt.current) {
        const elapsed = Math.floor((Date.now() - lcStartedAt.current) / 1000);
        const next = lcBaseRemaining.current - elapsed;
        setLcRemaining(next <= 0 ? 0 : next);
        if (next <= 0) setLcRunning(false);
      }
      if (projRunning && projStartedAt.current) {
        const delta = Math.floor((Date.now() - projStartedAt.current) / 1000);
        setProjElapsed(projBaseElapsed.current + delta);
      }
      if (studyRunning && studyStartedAt.current) {
        const delta = Math.floor((Date.now() - studyStartedAt.current) / 1000);
        setStudyElapsed(studyBaseElapsed.current + delta);
      }
      if (appRunning && appStartedAt.current) {
        const delta = Math.floor((Date.now() - appStartedAt.current) / 1000);
        setAppElapsed(appBaseElapsed.current + delta);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [lcRunning, projRunning, studyRunning, appRunning]);

  // ── Password Gate ──
  if (!isAuthenticated) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
        <div className="glass-card-strong p-12 w-full max-w-sm text-center">
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white/90 tracking-wide mb-1">Assistant</h1>
            <p className="text-white/40 text-sm tracking-wide">Enter password to continue</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
                placeholder="Password"
                autoFocus
                className={`w-full bg-white/5 border ${passwordError ? 'border-red-400/50' : 'border-white/10'} rounded-xl px-4 py-3 text-white text-center tracking-widest placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors`}
              />
              {passwordError && (
                <p className="text-red-400/80 text-xs mt-2 tracking-wide">Incorrect password. Try again.</p>
              )}
            </div>
            <button type="submit" className="w-full glass-button glass-button-primary px-4 py-3 tracking-wide">Unlock</button>
          </form>
        </div>
      </main>
    );
  }

  // ── Main UI — Two-column layout ──
  return (
    <main className="relative z-10 min-h-screen flex flex-col items-center p-6 gap-6">
      {/* Header */}
      <div className="text-center mt-8 mb-2">
        <h1 className="text-4xl font-bold text-white/90 tracking-tight">Assistant</h1>
        {currentTime && (
          <p className="text-white/40 text-sm mt-2 tracking-wide">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {' \u2013 '}
            {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
          </p>
        )}
      </div>

      {/* Two-column layout: timers left, calendar right */}
      <div className="main-layout w-full max-w-5xl">
        {/* Left column — Timers */}
        <div className="timers-column flex flex-col gap-6">
          {/* Timer Cards in grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Leetcode Countdown */}
            <div className={`glass-card-strong p-8 text-center overflow-hidden min-w-0${lcRunning ? ' timer-active' : ''} relative`}>
              <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-4">Leetcode</h2>
              <div className="timer-display text-3xl lg:text-4xl font-light text-white mb-6">
                {mounted ? formatTime(lcRemaining) : formatTime(LEETCODE_TOTAL_SECONDS)}
              </div>
              <div className="flex gap-3 justify-center">
                {!lcRunning ? (
                  <button
                    onClick={() => { if (lcRemaining > 0) setLcRunning(true); }}
                    disabled={lcRemaining <= 0}
                    className="glass-button glass-button-success px-6 py-3"
                  >
                    {lcRemaining < LEETCODE_TOTAL_SECONDS && lcRemaining > 0 ? 'Resume' : 'Start'}
                  </button>
                ) : (
                  <button onClick={() => setLcRunning(false)} className="glass-button glass-button-primary px-6 py-3">
                    Pause
                  </button>
                )}
                <button
                  onClick={() => { setLcRunning(false); setLcRemaining(LEETCODE_TOTAL_SECONDS); }}
                  className="glass-button px-6 py-3"
                >
                  Reset
                </button>
              </div>
              {lcRemaining <= 0 && (
                <p className="text-green-400/80 text-sm mt-3 font-medium">Completed!</p>
              )}
            </div>

            {/* Project Stopwatch */}
            <div className={`glass-card-strong p-8 text-center overflow-hidden min-w-0${projRunning ? ' timer-active' : ''} relative`}>
              <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-4">Project</h2>
              <div className="timer-display text-3xl lg:text-4xl font-light text-white mb-6">
                {mounted ? formatTime(projElapsed) : formatTime(0)}
              </div>
              <div className="flex gap-3 justify-center">
                {!projRunning ? (
                  <button onClick={() => setProjRunning(true)} className="glass-button glass-button-success px-6 py-3">
                    {projElapsed > 0 ? 'Resume' : 'Start'}
                  </button>
                ) : (
                  <button onClick={() => setProjRunning(false)} className="glass-button glass-button-primary px-6 py-3">
                    Pause
                  </button>
                )}
                <button
                  onClick={() => { setProjRunning(false); setProjElapsed(0); }}
                  className="glass-button px-6 py-3"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Study Stopwatch */}
            <div className={`glass-card-strong p-8 text-center overflow-hidden min-w-0${studyRunning ? ' timer-active' : ''} relative`}>
              <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-4">Study</h2>
              <div className="timer-display text-3xl lg:text-4xl font-light text-white mb-6">
                {mounted ? formatTime(studyElapsed) : formatTime(0)}
              </div>
              <div className="flex gap-3 justify-center">
                {!studyRunning ? (
                  <button onClick={() => setStudyRunning(true)} className="glass-button glass-button-success px-6 py-3">
                    {studyElapsed > 0 ? 'Resume' : 'Start'}
                  </button>
                ) : (
                  <button onClick={() => setStudyRunning(false)} className="glass-button glass-button-primary px-6 py-3">
                    Pause
                  </button>
                )}
                <button
                  onClick={() => { setStudyRunning(false); setStudyElapsed(0); }}
                  className="glass-button px-6 py-3"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Application Stopwatch */}
            <div className={`glass-card-strong p-8 text-center overflow-hidden min-w-0${appRunning ? ' timer-active' : ''} relative`}>
              <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-4">Application</h2>
              <div className="timer-display text-3xl lg:text-4xl font-light text-white mb-6">
                {mounted ? formatTime(appElapsed) : formatTime(0)}
              </div>
              <div className="flex gap-3 justify-center">
                {!appRunning ? (
                  <button onClick={() => setAppRunning(true)} className="glass-button glass-button-success px-6 py-3">
                    {appElapsed > 0 ? 'Resume' : 'Start'}
                  </button>
                ) : (
                  <button onClick={() => setAppRunning(false)} className="glass-button glass-button-primary px-6 py-3">
                    Pause
                  </button>
                )}
                <button
                  onClick={() => { setAppRunning(false); setAppElapsed(0); }}
                  className="glass-button px-6 py-3"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Calendar + Chart */}
        <div className="calendar-column">
          <Calendar completedDates={completedDates} />
          <DailyChart data={dailyData} />
        </div>
      </div>
    </main>
  );
}
