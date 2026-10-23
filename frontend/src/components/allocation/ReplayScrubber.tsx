import React from 'react';
import { Play, Pause, RotateCcw, Radio } from 'lucide-react';
import { TelemetryPayload } from '../../types/api';

interface ReplayScrubberProps {
  history: TelemetryPayload[];
  isReplaying: boolean;
  replayIndex: number;
  onSelectStep: (index: number) => void;
  onTogglePlay: () => void;
  onReturnToLive: () => void;
  onResetBuffer: () => void;
  speed: number;
  onToggleSpeed: () => void;
}

export const ReplayScrubber: React.FC<ReplayScrubberProps> = ({
  history,
  isReplaying,
  replayIndex,
  onSelectStep,
  onTogglePlay,
  onReturnToLive,
  onResetBuffer,
  speed,
  onToggleSpeed,
}) => {
  const maxFrames = history.length;
  const currentFrame = history[replayIndex] || history[maxFrames - 1];
  const stepNumber = currentFrame?.step ?? 0;

  return (
    <div className="p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs select-none">
      {/* Playback Controls & Status */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlay}
          disabled={maxFrames <= 1}
          className={`p-2 rounded-xl border transition-colors ${
            isReplaying
              ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
          }`}
          title={isReplaying ? 'Pause Replay' : 'Play Historical Allocation'}
        >
          {isReplaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          onClick={onToggleSpeed}
          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-[11px] border border-slate-200"
          title="Toggle Replay Speed"
        >
          {speed}x
        </button>

        <button
          onClick={onReturnToLive}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all ${
            !isReplaying
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
          }`}
          title="Jump to live simulator stream"
        >
          <Radio size={13} className={!isReplaying ? 'animate-pulse text-emerald-600' : 'text-slate-400'} />
          <span>Live</span>
        </button>

        <button
          onClick={onResetBuffer}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent transition-colors"
          title="Clear Replay Buffer"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Scrub Slider */}
      <div className="flex-1 max-w-xl w-full flex items-center gap-3">
        <span className="text-[11px] font-mono text-slate-400 shrink-0">
          -{maxFrames - 1 - replayIndex} steps
        </span>

        <input
          type="range"
          min={0}
          max={Math.max(0, maxFrames - 1)}
          value={replayIndex}
          onChange={(e) => onSelectStep(parseInt(e.target.value, 10))}
          className="w-full accent-sky-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
        />

        <div className="flex items-center gap-1 shrink-0 font-mono">
          <span className="text-slate-400">Step:</span>
          <span className="font-bold text-sky-700">{stepNumber}</span>
        </div>
      </div>
    </div>
  );
};
