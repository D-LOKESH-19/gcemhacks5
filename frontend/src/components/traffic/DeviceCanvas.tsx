import React, { useMemo } from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { Radio } from "lucide-react";

export const DeviceCanvas: React.FC = () => {
  const { latestPayload } = useSliceStore();

  const bots = latestPayload?.bots || { embb: 40, urllc: 30, murllc: 100 };

  // FT-35: Scale dots so each slice has at most 60 dots with an explicit scale label
  const { embbDots, embbScale } = useMemo(() => {
    const count = bots.embb || 0;
    const scale = count <= 60 ? 1 : Math.ceil(count / 60);
    const numDots = Math.min(60, Math.max(0, Math.round(count / scale)));
    return { embbDots: numDots, embbScale: scale };
  }, [bots.embb]);

  const { urllcDots, urllcScale } = useMemo(() => {
    const count = bots.urllc || 0;
    const scale = count <= 60 ? 1 : Math.ceil(count / 60);
    const numDots = Math.min(60, Math.max(0, Math.round(count / scale)));
    return { urllcDots: numDots, urllcScale: scale };
  }, [bots.urllc]);

  const { murllcDots, murllcScale } = useMemo(() => {
    const count = bots.murllc || 0;
    const scale = count <= 60 ? 1 : Math.ceil(count / 60);
    const numDots = Math.min(60, Math.max(0, Math.round(count / scale)));
    return { murllcDots: numDots, murllcScale: scale };
  }, [bots.murllc]);

  // Deterministic circular positioning around center (200, 160)
  const cx = 200;
  const cy = 160;

  // URLLC (inner radius 45 - 65)
  const urllcPoints = useMemo(() => {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < urllcDots; i++) {
      const angle = (i / Math.max(1, urllcDots)) * 2 * Math.PI + (i % 2 === 0 ? 0.1 : -0.1);
      const r = 48 + (i % 3) * 6;
      points.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    }
    return points;
  }, [urllcDots]);

  // eMBB (middle radius 80 - 105)
  const embbPoints = useMemo(() => {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < embbDots; i++) {
      const angle = (i / Math.max(1, embbDots)) * 2 * Math.PI + 0.3;
      const r = 82 + (i % 4) * 7;
      points.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    }
    return points;
  }, [embbDots]);

  // mURLLC (outer radius 120 - 145)
  const murllcPoints = useMemo(() => {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < murllcDots; i++) {
      const angle = (i / Math.max(1, murllcDots)) * 2 * Math.PI + 0.6;
      const r = 120 + (i % 5) * 6;
      points.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    }
    return points;
  }, [murllcDots]);

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            5G gNodeB Cell Radiation Field
          </h2>
        </div>
        {/* Scale Legend Labels (FT-35) */}
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-slice-embb flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slice-embb inline-block"></span>
            1 dot = {embbScale} bot{embbScale > 1 ? "s" : ""}
          </span>
          <span className="text-slice-urllc flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slice-urllc inline-block"></span>
            1 dot = {urllcScale} bot{urllcScale > 1 ? "s" : ""}
          </span>
          <span className="text-slice-murllc flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slice-murllc inline-block"></span>
            1 dot = {murllcScale} bot{murllcScale > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* SVG Antenna Canvas Field */}
      <div className="relative w-full h-[320px] flex items-center justify-center overflow-hidden my-2">
        <svg
          viewBox="0 0 400 320"
          className="w-full h-full max-h-[320px] select-none"
        >
          {/* Background Concentric Radar Rings */}
          <circle cx={cx} cy={cy} r="50" stroke="#E2E8F0" strokeWidth="1" fill="none" strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r="90" stroke="#E2E8F0" strokeWidth="1" fill="none" strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r="130" stroke="#E2E8F0" strokeWidth="1" fill="none" strokeDasharray="3 3" />

          {/* Radiating Packet Pulses Toward Tower */}
          <circle cx={cx} cy={cy} r="35" stroke="#22D3EE" strokeWidth="1.5" fill="none" opacity="0.4" className="animate-ping" style={{ animationDuration: "2.5s" }} />
          <circle cx={cx} cy={cy} r="75" stroke="#F59E0B" strokeWidth="1" fill="none" opacity="0.3" className="animate-ping" style={{ animationDuration: "3.2s" }} />

          {/* Central 5G Base Station Tower */}
          <g transform={`translate(${cx - 18}, ${cy - 18})`}>
            <circle cx="18" cy="18" r="22" fill="#FFFFFF" stroke="#22D3EE" strokeWidth="2" />
            <path
              d="M18 7 L24 28 L12 28 Z M18 10 L18 28 M14 20 L22 20"
              stroke="#22D3EE"
              strokeWidth="1.5"
              fill="none"
            />
          </g>

          {/* Outer Ring: mURLLC Dots (Violet) */}
          {murllcPoints.map((pt, i) => (
            <circle
              key={`m-${i}`}
              cx={pt.x}
              cy={pt.y}
              r="2.5"
              fill="#A78BFA"
              opacity="0.85"
              className="transition-all duration-300"
            />
          ))}

          {/* Middle Ring: eMBB Dots (Cyan) */}
          {embbPoints.map((pt, i) => (
            <circle
              key={`e-${i}`}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              fill="#22D3EE"
              opacity="0.9"
              className="transition-all duration-300"
            />
          ))}

          {/* Inner Ring: URLLC Dots (Amber) */}
          {urllcPoints.map((pt, i) => (
            <circle
              key={`u-${i}`}
              cx={pt.x}
              cy={pt.y}
              r="3"
              fill="#F59E0B"
              opacity="0.95"
              className="transition-all duration-300"
            />
          ))}
        </svg>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px] text-text-muted">
        <span>Concentric zones: URLLC (inner), eMBB (mid), mURLLC (outer)</span>
        <span className="font-mono text-cyan-400">Total UEs: {(bots.embb + bots.urllc + bots.murllc).toLocaleString()}</span>
      </div>
    </div>
  );
};
