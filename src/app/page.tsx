'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const SITE_PASSWORD = 'timer';
const LEETCODE_TOTAL_SECONDS = 2 * 60 * 60; // 2 hours
const SUPABASE_SAVE_INTERVAL = 5000; // 5 seconds

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
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
  await supabase
    .from('timer_state')
    .upsert({
      date,
      leetcode_remaining_seconds: leetcodeRemaining,
      project_elapsed_seconds: projectElapsed,
      study_elapsed_seconds: studyElapsed,
      app_elapsed_seconds: appElapsed,
    });
}

async function supabaseInsertCompleted(date: string) {
  await supabase
    .from('completed_dates')
    .upsert({ date });
}

async function supabaseFetchCompletedDates(): Promise<string[]> {
  const { data } = await supabase
    .from('completed_dates')
    .select('date');
  return (data ?? []).map((r: { date: string }) => r.date);
}

// ─── Calendar Component ───

function Calendar({ completedDates }: { completedDates: Set<string> }) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const today = getTodayString();

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

  // Project stopwatch
  const [projElapsed, setProjElapsed] = useState(0);
  const [projRunning, setProjRunning] = useState(false);
  const projInterval = useRef<NodeJS.Timeout | null>(null);

  // Study stopwatch
  const [studyElapsed, setStudyElapsed] = useState(0);
  const [studyRunning, setStudyRunning] = useState(false);
  const studyInterval = useRef<NodeJS.Timeout | null>(null);

  // Application stopwatch
  const [appElapsed, setAppElapsed] = useState(0);
  const [appRunning, setAppRunning] = useState(false);
  const appInterval = useRef<NodeJS.Timeout | null>(null);

  // Calendar
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());

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
      lcInterval.current = setInterval(() => {
        setLcRemaining((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            setLcRunning(false);
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
            return 0;
          }
          return next;
        });
      }, 1000);
    } else if (lcInterval.current) {
      clearInterval(lcInterval.current);
    }
    return () => {
      if (lcInterval.current) clearInterval(lcInterval.current);
    };
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
      projInterval.current = setInterval(() => {
        setProjElapsed((prev) => prev + 1);
      }, 1000);
    } else if (projInterval.current) {
      clearInterval(projInterval.current);
    }
    return () => {
      if (projInterval.current) clearInterval(projInterval.current);
    };
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
      studyInterval.current = setInterval(() => {
        setStudyElapsed((prev) => prev + 1);
      }, 1000);
    } else if (studyInterval.current) {
      clearInterval(studyInterval.current);
    }
    return () => {
      if (studyInterval.current) clearInterval(studyInterval.current);
    };
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
      appInterval.current = setInterval(() => {
        setAppElapsed((prev) => prev + 1);
      }, 1000);
    } else if (appInterval.current) {
      clearInterval(appInterval.current);
    }
    return () => {
      if (appInterval.current) clearInterval(appInterval.current);
    };
  }, [appRunning]);

  // Save application state when elapsed changes
  useEffect(() => {
    if (mounted) {
      saveStopwatch('appState', appElapsed, appRunning);
      saveToSupabase(lcRemaining, projElapsed, studyElapsed, appElapsed);
    }
  }, [appElapsed, appRunning, mounted, saveStopwatch, saveToSupabase, lcRemaining, projElapsed, studyElapsed]);

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

        {/* Right column — Calendar */}
        <div className="calendar-column">
          <Calendar completedDates={completedDates} />
        </div>
      </div>
    </main>
  );
}
