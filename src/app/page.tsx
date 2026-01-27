'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface StudySession {
  id: string;
  duration: number;
  date: string;
  label: string;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hrs > 0 && mins > 0) {
    return `${hrs}h ${mins}m`;
  } else if (hrs > 0) {
    return `${hrs}h`;
  } else if (mins > 0) {
    return `${mins}m`;
  }
  return `${seconds}s`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Home() {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [sessionLabel, setSessionLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('studySessions');
    if (stored) {
      setSessions(JSON.parse(stored));
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('studySessions', JSON.stringify(sessions));
  }, [sessions]);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  // Focus input when showing label input
  useEffect(() => {
    if (showLabelInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showLabelInput]);

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStop = () => {
    if (time > 0) {
      setIsRunning(false);
      setShowLabelInput(true);
    }
  };

  const handleSaveSession = useCallback(() => {
    if (time > 0) {
      const newSession: StudySession = {
        id: Date.now().toString(),
        duration: time,
        date: new Date().toISOString(),
        label: sessionLabel.trim() || 'Study Session',
      };
      setSessions((prev) => [...prev, newSession].sort((a, b) => b.duration - a.duration));
      setTime(0);
      setSessionLabel('');
      setShowLabelInput(false);
    }
  }, [time, sessionLabel]);

  const handleDiscardSession = () => {
    setTime(0);
    setSessionLabel('');
    setShowLabelInput(false);
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveSession();
    } else if (e.key === 'Escape') {
      handleDiscardSession();
    }
  };

  const getRankClass = (index: number): string => {
    if (index === 0) return 'rank-1';
    if (index === 1) return 'rank-2';
    if (index === 2) return 'rank-3';
    return 'rank-default';
  };

  return (
    <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 gap-8">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-4xl font-bold text-white/90 tracking-tight mb-2">
          Study Timer
        </h1>
        <p className="text-white/50 text-sm">
          Track your focus, build your streak
        </p>
      </div>

      {/* Timer Card */}
      <div className={`glass-card-strong p-10 relative ${isRunning ? 'timer-active' : ''}`}>
        <div className="timer-display text-7xl md:text-8xl font-light text-white text-center tracking-wider">
          {formatTime(time)}
        </div>
      </div>

      {/* Controls */}
      {!showLabelInput ? (
        <div className="flex gap-4">
          {!isRunning ? (
            <button
              onClick={handleStart}
              className="glass-button glass-button-success px-8 py-4 text-lg"
            >
              {time > 0 ? 'Resume' : 'Start'}
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="glass-button glass-button-primary px-8 py-4 text-lg"
            >
              Pause
            </button>
          )}
          {(time > 0 || isRunning) && (
            <button
              onClick={handleStop}
              className="glass-button glass-button-danger px-8 py-4 text-lg"
            >
              Stop
            </button>
          )}
        </div>
      ) : (
        <div className="glass-card p-6 w-full max-w-md">
          <p className="text-white/70 text-sm mb-3 text-center">
            Session completed: {formatDuration(time)}
          </p>
          <input
            ref={inputRef}
            type="text"
            value={sessionLabel}
            onChange={(e) => setSessionLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What were you studying?"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={handleSaveSession}
              className="flex-1 glass-button glass-button-success px-4 py-3"
            >
              Save
            </button>
            <button
              onClick={handleDiscardSession}
              className="flex-1 glass-button px-4 py-3"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {sessions.length > 0 && (
        <div className="glass-card p-6 w-full max-w-lg mt-4">
          <h2 className="text-xl font-semibold text-white/90 mb-4 flex items-center gap-2">
            <span className="text-2xl">🏆</span> Leaderboard
          </h2>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
            {sessions.map((session, index) => (
              <div
                key={session.id}
                className="leaderboard-item p-4 flex items-center gap-4 group"
              >
                <div className={`rank-badge ${getRankClass(index)}`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/90 font-medium truncate">
                    {session.label}
                  </p>
                  <p className="text-white/40 text-sm">
                    {formatDate(session.date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white/90 font-mono text-lg">
                    {formatDuration(session.duration)}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteSession(session.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-red-400 p-1"
                  title="Delete session"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="glass-card p-8 w-full max-w-lg text-center mt-4">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-white/50">
            Start your first study session to see your leaderboard!
          </p>
        </div>
      )}
    </main>
  );
}
