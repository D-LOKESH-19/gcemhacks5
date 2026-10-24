"""Seed sets for the lending phase. Tuning/validation and evaluation seeds are disjoint from each
other and from the seeds used by train.py (42-44 train, 51-55 validation, 100-119 evaluation)."""
from typing import List

LENDING_VALIDATION_SEEDS: List[int] = list(range(7000, 7020))  # the only seeds thresholds may be tuned on
LENDING_EVALUATION_SEEDS: List[int] = list(range(8000, 8020))  # held-out, never used for tuning
BASELINE_SEEDS: List[int] = [9001, 9002, 9003]                 # L0 equality fingerprint only
