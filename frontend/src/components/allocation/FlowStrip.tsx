import React, { useEffect, useRef } from 'react';
import { Smartphone, Radio, Cpu, Server, Layers, ShieldCheck, AlertCircle } from 'lucide-react';
import { BotCounts, BottleneckType, SliceType } from '../../types/api';

interface FlowStripProps {
  bottlenecks?: [BottleneckType, BottleneckType, BottleneckType];
  arrivals?: { embb: number; urllc: number; murllc: number };
  bots?: BotCounts;
  prbTotal?: number;
  vcpuTotal?: number;
}

const SLICE_COLORS: Record<SliceType, string> = {
  embb: '#22D3EE',
  urllc: '#F59E0B',
  murllc: '#A78BFA',
};

const SLICES: SliceType[] = ['embb', 'urllc', 'murllc'];

interface Particle {
  x: number;
  y: number;
  slice: SliceType;
  speed: number;
  radius: number;
}

export const FlowStrip: React.FC<FlowStripProps> = ({
  bottlenecks = ['none', 'none', 'none'],
  arrivals = { embb: 400, urllc: 30, murllc: 20 },
  bots,
  prbTotal = 100,
  vcpuTotal = 8,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Setup data-driven particles based on real arrivals
  useEffect(() => {
    const packetsPerParticle = 10;
    const maxTotalParticles = 120;

    const newParticles: Particle[] = [];
    SLICES.forEach((slice, idx) => {
      const arr = arrivals[slice] || 0;
      const count = Math.min(
        Math.floor(maxTotalParticles / 3),
        Math.max(2, Math.floor(arr / packetsPerParticle))
      );
      const isBottlenecked = bottlenecks[idx] !== 'none' && bottlenecks[idx] !== 'idle';
      const baseSpeed = isBottlenecked ? 0.8 : 2.4;

      for (let i = 0; i < count; i++) {
        newParticles.push({
          x: (i * 137 + idx * 79) % 800,
          y: 20 + idx * 24 + ((i * 17) % 6 - 3),
          slice,
          speed: baseSpeed + ((i * 7) % 5) * 0.08,
          radius: slice === 'embb' ? 2.5 : 2.0,
        });
      }
    });

    particlesRef.current = newParticles.slice(0, maxTotalParticles);
  }, [arrivals, bottlenecks]);

  // Particle animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Draw faint slice flow track lines
      SLICES.forEach((slice, idx) => {
        const y = 20 + idx * 24;
        ctx.beginPath();
        ctx.strokeStyle = `${SLICE_COLORS[slice]}20`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(40, y);
        ctx.lineTo(width - 40, y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Update and render particles
      particlesRef.current.forEach((p) => {
        p.x += p.speed;
        if (p.x > width - 40) {
          p.x = 40;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = SLICE_COLORS[p.slice];
        ctx.shadowColor = SLICE_COLORS[p.slice];
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const hasRadioBottleneck = bottlenecks.some((b) => b === 'radio' || b === 'both');
  const hasComputeBottleneck = bottlenecks.some((b) => b === 'compute' || b === 'both');

  return (
    <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-sky-600" />
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            End-to-End Network Slicing Flow Strip
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
            1 particle = 10 packets
          </span>
          <span>Max 120 particles</span>
        </div>
      </div>

      {/* Five Nodes Horizontal Flow Container */}
      <div className="relative py-2">
        {/* Background Particle Animation Canvas */}
        <canvas
          ref={canvasRef}
          width={880}
          height={88}
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        />

        {/* 5 Architectural Nodes */}
        <div className="relative z-10 grid grid-cols-5 gap-2 sm:gap-4 select-none">
          {/* Node 1: Devices */}
          <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mb-1 border border-sky-100">
              <Smartphone size={15} />
            </div>
            <span className="font-bold text-xs text-slate-800">1. Devices</span>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {bots ? (
                <span>{bots.embb + bots.urllc + bots.murllc} Bots</span>
              ) : (
                <span>UE Traffic</span>
              )}
            </div>
          </div>

          {/* Node 2: gNB Radio */}
          <div className={`p-2.5 rounded-xl bg-white/90 border shadow-sm flex flex-col items-center text-center transition-colors ${
            hasRadioBottleneck ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200'
          }`}>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mb-1 border border-sky-100">
              <Radio size={15} />
            </div>
            <span className="font-bold text-xs text-slate-800">2. gNB Radio</span>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              <span>{prbTotal} PRB Pool</span>
            </div>
            {hasRadioBottleneck && (
              <span className="text-[9px] font-bold text-amber-700 flex items-center gap-0.5 mt-0.5">
                <AlertCircle size={9} /> Bottleneck
              </span>
            )}
          </div>

          {/* Node 3: Slicer (Resource Controller) */}
          <div className="p-2.5 rounded-xl bg-sky-50/90 border-2 border-sky-400 shadow-sm flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center mb-1 shadow-xs">
              <ShieldCheck size={16} />
            </div>
            <span className="font-extrabold text-xs text-sky-950">3. Slicer</span>
            <div className="text-[9px] text-sky-800 font-medium mt-0.5 leading-tight">
              Resource Controller
            </div>
          </div>

          {/* Node 4: Edge UPF Compute */}
          <div className={`p-2.5 rounded-xl bg-white/90 border shadow-sm flex flex-col items-center text-center transition-colors ${
            hasComputeBottleneck ? 'border-purple-400 bg-purple-50/50' : 'border-slate-200'
          }`}>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-1 border border-purple-100">
              <Cpu size={15} />
            </div>
            <span className="font-bold text-xs text-slate-800">4. Edge UPF</span>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              <span>{vcpuTotal} vCPUs</span>
            </div>
            {hasComputeBottleneck && (
              <span className="text-[9px] font-bold text-purple-700 flex items-center gap-0.5 mt-0.5">
                <AlertCircle size={9} /> Bottleneck
              </span>
            )}
          </div>

          {/* Node 5: Destination Apps */}
          <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1 border border-emerald-100">
              <Server size={15} />
            </div>
            <span className="font-bold text-xs text-slate-800">5. Apps</span>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              <span>SLA Ensured</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
