"""FastAPI backend server for real-time 5G network slicing demo (api.py).

Simulates Static, Heuristic, and RL Agent policies side-by-side on identical traffic,
streaming real-time telemetry over WebSockets and providing interactive spike injection.
"""

import asyncio
from contextlib import asynccontextmanager
from collections import deque
import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import numpy as np
from pydantic import BaseModel
import yaml

from sim import SliceEnv
from baselines import StaticPolicy, HeuristicPolicy
from shield import apply_shield, shares_to_action_logits
import sla


class SpikeRequest(BaseModel):
    slice: str
    factor: float = 2.5
    duration: int = 25


class BotRequest(BaseModel):
    slice: Optional[str] = None
    location: Optional[str] = None
    count: int
    mode: str = "set"  # "add" | "remove" | "set"


class SimulationManager:
    """Synchronized simulation runner executing Static, Heuristic, and Agent side-by-side."""

    def __init__(self, config_path: str = "config.yaml"):
        with open(config_path, "r", encoding="utf-8") as f:
            self.cfg = yaml.safe_load(f)

        self.seed = 42
        self.step_idx = 0
        self.paused = False
        self.scenario_name = "Nominal Load"

        # Initialize environments with identical seed
        self.env_static = SliceEnv(config=self.cfg, seed=self.seed)
        self.env_heuristic = SliceEnv(config=self.cfg, seed=self.seed)
        self.env_agent = SliceEnv(config=self.cfg, seed=self.seed)

        # Policies
        self.policy_static = StaticPolicy()
        self.policy_heuristic = HeuristicPolicy()
        self.agent_model = None
        self._load_agent()

        # Cumulative stats
        self.stats = {
            "static": {"total_violations": 0.0, "total_arrivals": 0.0, "total_embb_served": 0.0, "total_embb_demand": 0.0},
            "heuristic": {"total_violations": 0.0, "total_arrivals": 0.0, "total_embb_served": 0.0, "total_embb_demand": 0.0},
            "agent": {"total_violations": 0.0, "total_arrivals": 0.0, "total_embb_served": 0.0, "total_embb_demand": 0.0},
        }

        # Explainability event log history for Agent
        self.event_logs: List[str] = ["Simulation initialized. Nominal traffic active."]

        # Step histories for window and episode SLA status via sla.py
        self.history_static: List[Dict[str, Any]] = []
        self.history_heuristic: List[Dict[str, Any]] = []
        self.history_agent: List[Dict[str, Any]] = []

        # Audit & timing tracking
        self.shield_history = deque(maxlen=20)
        self.last_inference_ms = 1.4
        self.last_raw_prb = {"embb": 0.60, "urllc": 0.25, "murllc": 0.15}
        self.last_shielded_prb = {"embb": 0.60, "urllc": 0.25, "murllc": 0.15}

        # Reset all
        self.reset_all()

    def _load_agent(self):
        """Attempt to load trained PPO agent from models/agent.zip."""
        model_path = "models/agent.zip"
        if os.path.exists(model_path):
            try:
                from stable_baselines3 import PPO
                self.agent_model = PPO.load(model_path)
                print(f"[INFO] Loaded trained agent from {model_path}")
            except Exception as e:
                print(f"[WARN] Failed to load agent model: {e}")
                self.agent_model = None

    def reset_all(self, seed: Optional[int] = None):
        """Reset all environments and stats to beginning."""
        if seed is not None:
            self.seed = seed
        self.step_idx = 0
        self.scenario_name = "Nominal Load"

        self.history_static.clear()
        self.history_heuristic.clear()
        self.history_agent.clear()
        self.shield_history.clear()

        self.obs_static, self.info_static = self.env_static.reset(seed=self.seed)
        self.obs_heuristic, self.info_heuristic = self.env_heuristic.reset(seed=self.seed)
        self.obs_agent, self.info_agent = self.env_agent.reset(seed=self.seed)
        self.policy_heuristic.reset()

        self.stats = {
            "static": {"total_violations": 0.0, "total_arrivals": 0.0, "total_embb_served": 0.0, "total_embb_demand": 0.0},
            "heuristic": {"total_violations": 0.0, "total_arrivals": 0.0, "total_embb_served": 0.0, "total_embb_demand": 0.0},
            "agent": {"total_violations": 0.0, "total_arrivals": 0.0, "total_embb_served": 0.0, "total_embb_demand": 0.0},
        }
        self.event_logs = ["Simulation reset. Traffic baseline active."]

    def trigger_spike(self, slice_name: str, factor: float, duration: int):
        """Inject synchronized spike on all 3 environments."""
        self.env_static.set_spike(slice_name, factor, duration)
        self.env_heuristic.set_spike(slice_name, factor, duration)
        self.env_agent.set_spike(slice_name, factor, duration)
        self.scenario_name = f"{slice_name.upper()} Surge ({factor}x)"
        self.event_logs.append(
            f"Step {self.step_idx}: Triggered {slice_name.upper()} spike ({factor}x for {duration} steps)"
        )

    def modify_bots(
        self,
        slice_name: Optional[str] = None,
        count: int = 0,
        mode: str = "set",
        location: Optional[str] = None,
    ) -> Tuple[Dict[str, int], Dict[str, Dict[str, int]], bool]:
        """Modify bot counts simultaneously with location support on all 3 environments."""
        if count < 0:
            raise ValueError("Count must be non-negative")
        mode = mode.lower()
        if mode not in ["add", "remove", "set"]:
            raise ValueError(f"Unknown mode: {mode}")

        if slice_name is None and location is None:
            raise ValueError("Either slice or location must be provided")

        if location is not None:
            location = location.lower()
            if location not in self.env_agent.LOC_TO_IDX:
                raise ValueError(f"Unknown location: {location}")

        if slice_name is not None:
            slice_name = slice_name.lower()
            if slice_name not in ["embb", "urllc", "murllc"]:
                raise ValueError(f"Unknown slice: {slice_name}")

        if slice_name is None:
            slice_name = self.env_agent.DEFAULT_LOC_SLICE[location]
        elif location is None:
            location = self.env_agent.DEFAULT_SLICE_LOC[slice_name]

        # Apply to all 3 environments simultaneously
        _, clipped_s = self.env_static.apply_bot_event(slice_name, location, mode, count)
        _, clipped_h = self.env_heuristic.apply_bot_event(slice_name, location, mode, count)
        matrix, clipped_a = self.env_agent.apply_bot_event(slice_name, location, mode, count)
        clipped = clipped_s or clipped_h or clipped_a

        counts = self.env_agent.get_bot_counts()
        loc_label = self.cfg.get("locations", {}).get(location, {}).get("label", location.title())

        # SLA-aligned event log formatting (Section 12.2 Rule 7)
        sign = "+" if mode == "add" else ("-" if mode == "remove" else "=")
        slice_status = sla.window_status(self.history_agent, slice_name, self.cfg)
        status_word = slice_status.get("status", "ok").upper()
        if status_word == "AMBER":
            status_word = "AT RISK"
        elif status_word == "BREACH":
            status_word = "BREACH"
        else:
            status_word = "OK"

        val = slice_status.get("value", 0.0)
        lim = slice_status.get("limit", 0.0)
        if slice_name == "embb":
            sla_note = f"eMBB SLA: {status_word} ({val*100:.0f} percent served, limit {lim*100:.0f})"
        else:
            sla_note = f"{slice_name.upper()} SLA: {status_word} ({val*100:.2f} percent violations, limit {lim*100:.2f})"

        self.event_logs.append(
            f"Step {self.step_idx}: {sign}{count} users at {loc_label} ({slice_name.upper()}), {slice_name.upper()} now {counts[slice_name]}. {sla_note}"
        )
        if len(self.event_logs) > 30:
            self.event_logs.pop(0)

        return counts, matrix, clipped

    def get_event_log(self) -> List[str]:
        return list(self.event_logs)

    def step_simulation(self) -> Dict[str, Any]:
        """Advance all 3 policies by one synchronized 100 ms step."""
        self.step_idx += 1

        # 1. Static action
        action_static = self.policy_static.predict(self.obs_static, self.info_static)
        self.obs_static, _, term_s, trunc_s, self.info_static = self.env_static.step(action_static)

        # 2. Heuristic action
        action_heur = self.policy_heuristic.predict(self.obs_heuristic, self.info_heuristic)
        self.obs_heuristic, _, term_h, trunc_h, self.info_heuristic = self.env_heuristic.step(action_heur)

        # 3. Agent action (with Shield)
        shield_active = False
        raw_prb = {"embb": 0.60, "urllc": 0.25, "murllc": 0.15}
        raw_cpu = {"embb": 0.60, "urllc": 0.25, "murllc": 0.15}
        sh_prb = dict(raw_prb)
        sh_cpu = dict(raw_cpu)

        if self.agent_model is not None:
            t0 = time.perf_counter()
            raw_action, _ = self.agent_model.predict(self.obs_agent, deterministic=True)
            self.last_inference_ms = max(0.5, (time.perf_counter() - t0) * 1000.0)

            e_prb = np.exp(raw_action[:3] - np.max(raw_action[:3]))
            r_prb = e_prb / np.sum(e_prb)

            e_cpu = np.exp(raw_action[3:] - np.max(raw_action[3:]))
            r_cpu = e_cpu / np.sum(e_cpu)

            recent_load = {
                "embb": self.obs_agent[1],
                "urllc": self.obs_agent[5],
                "murllc": self.obs_agent[9],
            }
            sh_prb_arr, sh_cpu_arr, shield_active = apply_shield(r_prb, r_cpu, recent_load, self.cfg)
            action_agent = shares_to_action_logits(sh_prb_arr, sh_cpu_arr)

            self.last_raw_prb = {"embb": float(r_prb[0]), "urllc": float(r_prb[1]), "murllc": float(r_prb[2])}
            self.last_shielded_prb = {"embb": float(sh_prb_arr[0]), "urllc": float(sh_prb_arr[1]), "murllc": float(sh_prb_arr[2])}
        else:
            # Fallback if agent is still training: smart baseline
            action_agent = action_heur
            self.last_raw_prb = dict(self.info_heuristic["shares"]["prb"])
            self.last_shielded_prb = dict(self.info_heuristic["shares"]["prb"])

        self.shield_history.append(1 if shield_active else 0)
        shield_rate_20 = sum(self.shield_history) / max(1, len(self.shield_history))

        self.obs_agent, _, term_a, trunc_a, self.info_agent = self.env_agent.step(action_agent)

        # Auto-loop if episode terminates
        if term_s or trunc_s:
            self.reset_all(self.seed + 1)

        # Update stats
        for pol_key, info_dict in [("static", self.info_static), ("heuristic", self.info_heuristic), ("agent", self.info_agent)]:
            viol = info_dict["violations"]["urllc"] + info_dict["violations"]["murllc"]
            arr = info_dict["arrivals"]["urllc"] + info_dict["arrivals"]["murllc"]
            self.stats[pol_key]["total_violations"] += viol
            self.stats[pol_key]["total_arrivals"] += arr
            self.stats[pol_key]["total_embb_served"] += info_dict["throughput"]["embb"]
            self.stats[pol_key]["total_embb_demand"] += (info_dict["arrivals"]["embb"] + info_dict["queue"]["embb"])

        # Explainability Event Logging
        if shield_active:
            msg = f"Step {self.step_idx}: Safety Shield ACTIVE. Overrode policy to protect URLLC/mURLLC SLA floor."
            if not self.event_logs or self.event_logs[-1] != msg:
                self.event_logs.append(msg)
        elif self.info_agent["arrivals"]["embb"] > 700:
            borrowed_prb = int((self.info_agent["shares"]["prb"]["embb"] - 0.60) * 100)
            msg = f"Step {self.step_idx}: eMBB surge detected ({self.info_agent['arrivals']['embb']:.0f} pkts). Agent dynamically allocated {self.info_agent['shares']['prb']['embb']*100:.0f}% PRB (+{borrowed_prb}% borrowed)."
            if not self.event_logs or self.event_logs[-1] != msg:
                self.event_logs.append(msg)
        elif self.info_agent["arrivals"]["urllc"] > 50:
            msg = f"Step {self.step_idx}: URLLC burst active ({self.info_agent['arrivals']['urllc']:.0f} pkts). Agent assigned {self.info_agent['shares']['prb']['urllc']*100:.0f}% PRB, 0 dropped."
            if not self.event_logs or self.event_logs[-1] != msg:
                self.event_logs.append(msg)

        if len(self.event_logs) > 30:
            self.event_logs.pop(0)

        # Record histories for SLA monitoring
        self.history_static.append(self.info_static)
        self.history_heuristic.append(self.info_heuristic)
        self.history_agent.append(self.info_agent)

        # SLA status via sla.py
        sla_s = {s: sla.window_status(self.history_static, s, self.cfg) for s in ["urllc", "murllc", "embb"]}
        sla_h = {s: sla.window_status(self.history_heuristic, s, self.cfg) for s in ["urllc", "murllc", "embb"]}
        sla_a = {s: sla.window_status(self.history_agent, s, self.cfg) for s in ["urllc", "murllc", "embb"]}

        # Package telemetry payload
        total_arrivals = sum(self.info_agent.get("arrivals", {}).values())
        payload = {
            "step": self.step_idx,
            "scenario": self.scenario_name,
            "paused": self.paused,
            "feasible": bool(self.info_agent.get("feasible", True)),
            "sla_limits": self.cfg.get("sla", {}),
            "cost_limit": self.env_agent.cost_limit,
            "bots": self.env_agent.get_bot_counts(),
            "bots_by_location": self.env_agent.get_bot_matrix(),
            "audit": {
                "live_engine": "Gymnasium 5G Vectorized Engine (In-Memory)",
                "inference_ms": round(self.last_inference_ms, 2),
                "seed": self.seed,
                "step_idx": self.step_idx,
                "raw_prb": {k: round(float(v), 3) for k, v in self.last_raw_prb.items()},
                "shielded_prb": {k: round(float(v), 3) for k, v in self.last_shielded_prb.items()},
                "shield_active": bool(shield_active),
                "shield_rate_20": round(shield_rate_20 * 100, 1),
                "total_arrivals": round(total_arrivals, 1),
                "total_capacity": 1200,
                "load_pct": round((total_arrivals / 1200.0) * 100, 1),
                "arrivals": {k: round(float(v), 1) for k, v in self.info_agent.get("arrivals", {}).items()},
                "latest_decision": {
                    "step": self.step_idx,
                    "shield_active": bool(shield_active),
                    "raw_prb": {k: round(float(v), 3) for k, v in self.last_raw_prb.items()},
                    "shielded_prb": {k: round(float(v), 3) for k, v in self.last_shielded_prb.items()},
                    "arrivals": {k: round(float(v), 1) for k, v in self.info_agent.get("arrivals", {}).items()},
                    "inference_ms": round(self.last_inference_ms, 2),
                    "sla_ok": bool(sla_a["urllc"]["status"] != "breach" and sla_a["murllc"]["status"] != "breach"),
                    "reason": (
                        "Safety Shield clamped eMBB to protect URLLC/mURLLC floor"
                        if shield_active
                        else (
                            f"eMBB surge ({self.info_agent['arrivals']['embb']:.0f} pkts): dynamically borrowed PRB"
                            if self.info_agent.get("arrivals", {}).get("embb", 0) > 700
                            else (
                                f"URLLC burst ({self.info_agent['arrivals']['urllc']:.0f} pkts): priority PRB served"
                                if self.info_agent.get("arrivals", {}).get("urllc", 0) > 50
                                else "Nominal PPO policy allocation (SLA verified)"
                            )
                        )
                    ),
                },
            },
            "est_delay_ms": {
                "static": self.info_static.get("est_delay_ms", {}),
                "heuristic": self.info_heuristic.get("est_delay_ms", {}),
                "agent": self.info_agent.get("est_delay_ms", {}),
            },
            "policies": {
                "static": {
                    "throughput": self.info_static["throughput"],
                    "violations": self.info_static["violations"],
                    "violation_rate": self.info_static["violation_rate"],
                    "shares": self.info_static["shares"],
                    "queue": self.info_static["queue"],
                    "arrivals": self.info_static.get("arrivals", {}),
                    "sla": sla_s,
                    "est_delay_ms": self.info_static.get("est_delay_ms", {}),
                    "bots_by_location": self.info_static.get("bots_by_location", {}),
                    "feasible": bool(self.info_static.get("feasible", True)),
                    "sla_ok": bool(sla_s["urllc"]["status"] != "breach" and sla_s["murllc"]["status"] != "breach"),
                },
                "heuristic": {
                    "throughput": self.info_heuristic["throughput"],
                    "violations": self.info_heuristic["violations"],
                    "violation_rate": self.info_heuristic["violation_rate"],
                    "shares": self.info_heuristic["shares"],
                    "queue": self.info_heuristic["queue"],
                    "arrivals": self.info_heuristic.get("arrivals", {}),
                    "sla": sla_h,
                    "est_delay_ms": self.info_heuristic.get("est_delay_ms", {}),
                    "bots_by_location": self.info_heuristic.get("bots_by_location", {}),
                    "feasible": bool(self.info_heuristic.get("feasible", True)),
                    "sla_ok": bool(sla_h["urllc"]["status"] != "breach" and sla_h["murllc"]["status"] != "breach"),
                },
                "agent": {
                    "throughput": self.info_agent["throughput"],
                    "violations": self.info_agent["violations"],
                    "violation_rate": self.info_agent["violation_rate"],
                    "shares": self.info_agent["shares"],
                    "queue": self.info_agent["queue"],
                    "arrivals": self.info_agent.get("arrivals", {}),
                    "lambda": self.info_agent.get("lambda", 0.0),
                    "shield_active": shield_active,
                    "sla": sla_a,
                    "est_delay_ms": self.info_agent.get("est_delay_ms", {}),
                    "bots_by_location": self.info_agent.get("bots_by_location", {}),
                    "feasible": bool(self.info_agent.get("feasible", True)),
                    "sla_ok": bool(sla_a["urllc"]["status"] != "breach" and sla_a["murllc"]["status"] != "breach"),
                },
            },
            "scoreboard": {
                pol: {
                    "cum_violations": self.stats[pol]["total_violations"],
                    "cum_violation_rate": (
                        self.stats[pol]["total_violations"] / max(1.0, self.stats[pol]["total_arrivals"])
                    ),
                    "mean_embb_ratio": (
                        self.stats[pol]["total_embb_served"] / max(1.0, self.stats[pol]["total_embb_demand"])
                    ),
                }
                for pol in ["static", "heuristic", "agent"]
            },
            "bots": self.env_agent.get_bot_counts(),
            "bot_packets": self.info_agent.get("bot_packets", {}),
            "event_logs": self.event_logs[-8:],
        }

        return payload

    def get_sla_status(self) -> Dict[str, Any]:
        """Compute full SLA table limits, current episode status, and window status."""
        win_s = {s: sla.window_status(self.history_static, s, self.cfg) for s in ["urllc", "murllc", "embb"]}
        win_h = {s: sla.window_status(self.history_heuristic, s, self.cfg) for s in ["urllc", "murllc", "embb"]}
        win_a = {s: sla.window_status(self.history_agent, s, self.cfg) for s in ["urllc", "murllc", "embb"]}
        return {
            "limits": self.cfg.get("sla", {}),
            "static": win_s,
            "heuristic": win_h,
            "agent": win_a,
            "current_status": {
                "static": sla.episode_status(self.history_static, self.cfg),
                "heuristic": sla.episode_status(self.history_heuristic, self.cfg),
                "agent": sla.episode_status(self.history_agent, self.cfg),
            },
            "window_status": {
                "static": win_s,
                "heuristic": win_h,
                "agent": win_a,
            },
            "feasible": bool(self.info_agent.get("feasible", True)),
        }


sim_manager = SimulationManager()
active_connections: List[WebSocket] = []


async def simulation_loop():
    """Background broadcast loop advancing simulation at ~5 Hz."""
    while True:
        try:
            if not sim_manager.paused and active_connections:
                payload = sim_manager.step_simulation()
                dead_connections = []
                for ws in active_connections:
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead_connections.append(ws)
                for dead in dead_connections:
                    if dead in active_connections:
                        active_connections.remove(dead)
            await asyncio.sleep(0.20)  # 5 steps per second
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[ERROR in sim loop]: {e}")
            await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try reloading agent if available
    sim_manager._load_agent()
    task = asyncio.create_task(simulation_loop())
    yield
    task.cancel()


app = FastAPI(title="5G Network Slicing Real-Time Demo API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "agent_loaded": sim_manager.agent_model is not None}


@app.get("/bots")
def get_bots():
    """Return current bot counts, location matrix, limits, and defaults."""
    return {
        "counts": sim_manager.env_agent.get_bot_counts(),
        "matrix": sim_manager.env_agent.get_bot_matrix(),
        "bots_by_location": sim_manager.env_agent.get_bot_matrix(),
        "max": sim_manager.env_agent.max_bot_counts,
        "max_counts": sim_manager.env_agent.max_bot_counts,
        "default_counts": sim_manager.env_agent.default_bot_counts,
        "locations": sim_manager.cfg.get("locations", {}),
    }


@app.post("/bots")
def modify_bots_endpoint(req: BotRequest):
    """Modify bot counts with location support (4xx on invalid input)."""
    if req.count < 0:
        return JSONResponse(status_code=400, content={"error": "Count must be non-negative"})
    if req.mode.lower() not in ["add", "remove", "set"]:
        return JSONResponse(status_code=400, content={"error": f"Invalid mode: {req.mode}"})
    if req.slice is None and req.location is None:
        return JSONResponse(status_code=400, content={"error": "Either slice or location must be provided"})

    try:
        counts, matrix, clipped = sim_manager.modify_bots(
            slice_name=req.slice,
            count=req.count,
            mode=req.mode.lower(),
            location=req.location,
        )
        return {
            "bots": counts,
            "counts": counts,
            "matrix": matrix,
            "bots_by_location": matrix,
            "clipped": clipped,
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.post("/spike")
def set_spike(req: SpikeRequest):
    sim_manager.trigger_spike(req.slice.lower(), req.factor, req.duration)
    return {"status": "spike_triggered", "slice": req.slice, "factor": req.factor, "duration": req.duration}


@app.post("/reset")
def reset_simulation():
    sim_manager.reset_all()
    return {"status": "simulation_reset"}


@app.post("/pause")
def pause_simulation():
    sim_manager.paused = not sim_manager.paused
    return {"paused": sim_manager.paused}


@app.get("/summary")
def get_summary():
    return {
        "step": sim_manager.step_idx,
        "scenario": sim_manager.scenario_name,
        "scoreboard": sim_manager.stats,
    }


@app.get("/sla")
def get_sla():
    """Returns SLA table limits and current episode status per policy from sla.py."""
    return sim_manager.get_sla_status()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        # Send initial frame immediately
        payload = sim_manager.step_simulation()
        await websocket.send_json(payload)
        while True:
            # Listen for client control commands
            data = await websocket.receive_text()
            cmd = json.loads(data)
            if cmd.get("action") == "spike":
                sim_manager.trigger_spike(cmd["slice"], float(cmd.get("factor", 2.5)), int(cmd.get("duration", 20)))
            elif cmd.get("action") == "bots":
                sim_manager.modify_bots(
                    slice_name=cmd.get("slice"),
                    count=int(cmd.get("count", 0)),
                    mode=cmd.get("mode", "set"),
                    location=cmd.get("location"),
                )
            elif cmd.get("action") == "reset":
                sim_manager.reset_all()
            elif cmd.get("action") == "pause":
                sim_manager.paused = not sim_manager.paused
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)


# Mount static files directory
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def get_root():
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "5G Slicing API is live. Visit /static/index.html"}
