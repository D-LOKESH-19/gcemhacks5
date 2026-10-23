"""FastAPI backend server for real-time 5G network slicing demo (api.py).

Simulates Static, Heuristic, and RL Agent policies side-by-side on identical traffic,
streaming real-time telemetry over WebSockets and providing interactive spike injection.
"""

import asyncio
from contextlib import asynccontextmanager
import json
import os
from typing import Any, Dict, List, Optional
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


class SpikeRequest(BaseModel):
    slice: str
    factor: float = 2.5
    duration: int = 25


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
        if self.agent_model is not None:
            raw_action, _ = self.agent_model.predict(self.obs_agent, deterministic=True)
            e_prb = np.exp(raw_action[:3] - np.max(raw_action[:3]))
            raw_prb = e_prb / np.sum(e_prb)
            e_cpu = np.exp(raw_action[3:] - np.max(raw_action[3:]))
            raw_cpu = e_cpu / np.sum(e_cpu)

            recent_load = {
                "embb": self.obs_agent[1],
                "urllc": self.obs_agent[5],
                "murllc": self.obs_agent[9],
            }
            sh_prb, sh_cpu, shield_active = apply_shield(raw_prb, raw_cpu, recent_load, self.cfg)
            action_agent = shares_to_action_logits(sh_prb, sh_cpu)
        else:
            # Fallback if agent is still training: smart baseline
            action_agent = action_heur

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

        # Package telemetry payload
        payload = {
            "step": self.step_idx,
            "scenario": self.scenario_name,
            "paused": self.paused,
            "cost_limit": self.env_agent.cost_limit,
            "policies": {
                "static": {
                    "throughput": self.info_static["throughput"],
                    "violations": self.info_static["violations"],
                    "violation_rate": self.info_static["violation_rate"],
                    "shares": self.info_static["shares"],
                    "queue": self.info_static["queue"],
                    "sla_ok": self.info_static["violation_rate"] <= self.env_static.cost_limit,
                },
                "heuristic": {
                    "throughput": self.info_heuristic["throughput"],
                    "violations": self.info_heuristic["violations"],
                    "violation_rate": self.info_heuristic["violation_rate"],
                    "shares": self.info_heuristic["shares"],
                    "queue": self.info_heuristic["queue"],
                    "sla_ok": self.info_heuristic["violation_rate"] <= self.env_heuristic.cost_limit,
                },
                "agent": {
                    "throughput": self.info_agent["throughput"],
                    "violations": self.info_agent["violations"],
                    "violation_rate": self.info_agent["violation_rate"],
                    "shares": self.info_agent["shares"],
                    "queue": self.info_agent["queue"],
                    "lambda": self.info_agent.get("lambda", 0.0),
                    "shield_active": shield_active,
                    "sla_ok": self.info_agent["violation_rate"] <= self.env_agent.cost_limit,
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
            "event_logs": self.event_logs[-8:],
        }

        return payload


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
