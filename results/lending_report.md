# Lending evaluation report (auto-generated from results/lending_*.csv)

Slice-level simulator. Risk is a forecast from past traffic only. Evaluation seeds were never used for tuning.

- Tuning/validation seeds: 7000..7019 (20 seeds)
- Evaluation (held-out) seeds: 8000..8019 (20 seeds); disjoint from the tuning seeds
- Tuning chose {'risk.high': 0.3, 'risk.confirm_steps': 2, 'forecast.ewma_alpha': 0.4} (shipped defaults {'risk.high': 0.3, 'risk.confirm_steps': 2, 'forecast.ewma_alpha': 0.4}); a 12-point grid was flat on validation seeds, so the defaults were kept.
- Feasible scenarios (headline numbers use only these): Steady, eMBB surge, URLLC burst, mURLLC storm, Bots 0.3x, Bots 1.0x
- Overload scenarios (reported separately): Bots 3.0x, Bots 5.0x

## Headline (feasible scenarios, paired per seed, 95% bootstrap interval; improvement > 0 means Enhanced is better)

| Comparison | Metric | Enhanced | Baseline | Improvement [95% CI] | Verdict |
| --- | --- | ---: | ---: | --- | --- |
| vs original Agent+Shield | URLLC+mURLLC violated packets (sum over scenarios) | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | no difference (identical on every seed) |
| vs original Agent+Shield | onset-window violated packets | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | no difference (identical on every seed) |
| vs original Agent+Shield | mean eMBB served ratio | 0.9380 | 0.9380 | 0.0000 [-0.0000, 0.0000] | no reliable difference (interval includes 0) |
| vs original Agent+Shield | mean utilization | 0.3414 | 0.3413 | 0.0000 [0.0000, 0.0001] | better but negligible (|effect| < 0.001) |
| vs Enhanced reactive | URLLC+mURLLC violated packets (sum over scenarios) | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | no difference (identical on every seed) |
| vs Enhanced reactive | onset-window violated packets | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | no difference (identical on every seed) |
| vs Enhanced reactive | mean eMBB served ratio | 0.9380 | 0.9380 | 0.0000 [-0.0000, 0.0000] | no reliable difference (interval includes 0) |
| vs Enhanced reactive | mean utilization | 0.3414 | 0.3413 | 0.0000 [0.0000, 0.0001] | better but negligible (|effect| < 0.001) |
| vs Heuristic+Shield | URLLC+mURLLC violated packets (sum over scenarios) | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | no difference (identical on every seed) |
| vs Heuristic+Shield | onset-window violated packets | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | no difference (identical on every seed) |
| vs Heuristic+Shield | mean eMBB served ratio | 0.9380 | 0.9380 | -0.0000 [-0.0000, -0.0000] | worse but negligible (|effect| < 0.001) |
| vs Heuristic+Shield | mean utilization | 0.3414 | 0.3413 | 0.0000 [0.0000, 0.0001] | better but negligible (|effect| < 0.001) |
| vs Static | URLLC+mURLLC violated packets (sum over scenarios) | 0.1120 | 111.7000 | 111.5880 [63.5257, 163.6775] | better (interval above 0) |
| vs Static | onset-window violated packets | 0.1120 | 21.1000 | 20.9880 [5.1500, 41.2383] | better (interval above 0) |
| vs Static | mean eMBB served ratio | 0.9380 | 0.9310 | 0.0070 [0.0059, 0.0083] | better (interval above 0) |
| vs Static | mean utilization | 0.3414 | 0.3396 | 0.0018 [0.0018, 0.0019] | better (interval above 0) |

## Per scenario: Enhanced vs original Agent+Shield (paired)

| Scenario | Regime | Metric | Agent | Enhanced | Improvement [95% CI] | Seeds differing | Verdict |
| --- | --- | --- | ---: | ---: | --- | ---: | --- |
| Steady | feasible | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Steady | feasible | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Steady | feasible | embb_ratio | 1.0000 | 1.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Steady | feasible | util | 0.3736 | 0.3736 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| eMBB surge | feasible | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| eMBB surge | feasible | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| eMBB surge | feasible | embb_ratio | 0.6288 | 0.6288 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| eMBB surge | feasible | util | 0.4325 | 0.4325 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| URLLC burst | feasible | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| URLLC burst | feasible | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| URLLC burst | feasible | embb_ratio | 0.9995 | 0.9995 | 0.0000 [-0.0000, 0.0000] | 3/20 | no reliable difference (interval includes 0) |
| URLLC burst | feasible | util | 0.3786 | 0.3786 | -0.0000 [-0.0000, 0.0000] | 8/20 | no reliable difference (interval includes 0) |
| mURLLC storm | feasible | viol_total | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| mURLLC storm | feasible | onset_viol_total | 0.1120 | 0.1120 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| mURLLC storm | feasible | embb_ratio | 0.9998 | 0.9998 | 0.0000 [0.0000, 0.0000] | 1/20 | no reliable difference (interval includes 0) |
| mURLLC storm | feasible | util | 0.3784 | 0.3785 | 0.0001 [0.0000, 0.0004] | 20/20 | better but negligible (|effect| < 0.001) |
| Bots 0.3x | feasible | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 0.3x | feasible | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 0.3x | feasible | embb_ratio | 1.0000 | 1.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 0.3x | feasible | util | 0.1115 | 0.1115 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 1.0x | feasible | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 1.0x | feasible | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 1.0x | feasible | embb_ratio | 1.0000 | 1.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 1.0x | feasible | util | 0.3736 | 0.3736 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 3.0x | overload | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 3.0x | overload | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 3.0x | overload | embb_ratio | 0.1671 | 0.1671 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 3.0x | overload | util | 0.5654 | 0.5654 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 5.0x | overload | viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 5.0x | overload | onset_viol_total | 0.0000 | 0.0000 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 5.0x | overload | embb_ratio | 0.0864 | 0.0864 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |
| Bots 5.0x | overload | util | 0.4909 | 0.4909 | 0.0000 [0.0000, 0.0000] | 0/20 | no difference (identical on every seed) |

## Predictive vs reactive vs ablations (onset-window violations, eMBB ratio, utilization; positive = Enhanced better)

| Scenario | Baseline | Metric | Improvement [95% CI] | Verdict |
| --- | --- | --- | --- | --- |
| Steady | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_reactive | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Steady | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_reactive | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| eMBB surge | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| URLLC burst | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| URLLC burst | enhanced_reactive | embb_ratio | 0.00000 [-0.00000, 0.00000] | no reliable difference (interval includes 0) |
| URLLC burst | enhanced_reactive | util | -0.00000 [-0.00000, 0.00000] | no reliable difference (interval includes 0) |
| URLLC burst | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| URLLC burst | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no reliable difference (interval includes 0) |
| URLLC burst | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | better but negligible (|effect| < 0.001) |
| URLLC burst | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| URLLC burst | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| URLLC burst | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| mURLLC storm | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| mURLLC storm | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no reliable difference (interval includes 0) |
| mURLLC storm | enhanced_reactive | util | 0.00014 [0.00000, 0.00038] | better but negligible (|effect| < 0.001) |
| mURLLC storm | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| mURLLC storm | enhanced_no_return | embb_ratio | 0.00001 [0.00000, 0.00002] | no reliable difference (interval includes 0) |
| mURLLC storm | enhanced_no_return | util | -0.00287 [-0.00697, -0.00004] | worse (interval below 0) |
| mURLLC storm | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| mURLLC storm | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| mURLLC storm | enhanced_radio_only | util | -0.00039 [-0.00078, -0.00006] | worse but negligible (|effect| < 0.001) |
| Bots 0.3x | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_reactive | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 0.3x | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_reactive | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 1.0x | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_reactive | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 3.0x | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_reactive | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_reactive | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_reactive | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_no_return | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_no_return | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_no_return | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_radio_only | onset_viol_total | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_radio_only | embb_ratio | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |
| Bots 5.0x | enhanced_radio_only | util | 0.00000 [0.00000, 0.00000] | no difference (identical on every seed) |

## Loan statistics (Enhanced variants, mean over seeds)

| Scenario | Policy | Loans opened | Mean amount (share) | Mean duration (steps) | Mean return lag (steps) | Recalls | Time in overload |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Steady | enhanced | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Steady | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Steady | enhanced_no_return | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Steady | enhanced_radio_only | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| eMBB surge | enhanced | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 16.0% |
| eMBB surge | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 11.4% |
| eMBB surge | enhanced_no_return | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 16.0% |
| eMBB surge | enhanced_radio_only | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 16.0% |
| URLLC burst | enhanced | 0.55 | 0.005 | 5.8 | 2.8 | 0.00 | 0.0% |
| URLLC burst | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| URLLC burst | enhanced_no_return | 0.55 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| URLLC burst | enhanced_radio_only | 0.55 | 0.005 | 5.8 | 2.8 | 0.00 | 0.0% |
| mURLLC storm | enhanced | 1.95 | 0.083 | 23.1 | 11.7 | 0.00 | 0.0% |
| mURLLC storm | enhanced_reactive | 0.05 | 0.003 | 0.6 | 0.6 | 0.00 | 0.0% |
| mURLLC storm | enhanced_no_return | 1.95 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| mURLLC storm | enhanced_radio_only | 1.00 | 0.116 | 25.5 | 13.3 | 0.00 | 0.0% |
| Bots 0.3x | enhanced | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 0.3x | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 0.3x | enhanced_no_return | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 0.3x | enhanced_radio_only | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 1.0x | enhanced | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 1.0x | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 1.0x | enhanced_no_return | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 1.0x | enhanced_radio_only | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 0.0% |
| Bots 3.0x | enhanced | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 98.9% |
| Bots 3.0x | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 99.0% |
| Bots 3.0x | enhanced_no_return | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 98.9% |
| Bots 3.0x | enhanced_radio_only | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 98.9% |
| Bots 5.0x | enhanced | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 99.0% |
| Bots 5.0x | enhanced_reactive | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 99.5% |
| Bots 5.0x | enhanced_no_return | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 99.0% |
| Bots 5.0x | enhanced_radio_only | 0.00 | 0.000 | 0.0 | 0.0 | 0.00 | 99.0% |

## Predictor quality (held-out seeds, offline replay on Static / Heuristic+Shield / Agent+Shield / lean-stress traces)

- Brier 0.00397 vs constant-rate 0.07029 (skill 0.944); AUC 0.9989; calibration error (ECE) 0.0146
- One-step forecast MAE 29.13 vs naive last-value 28.96
  - embb: base rate 0.1603, Brier 0.00181 (constant 0.13462), AUC 0.9999, MAE 73.93 vs naive 72.56
  - urllc: base rate 0.0392, Brier 0.00093 (constant 0.03768), AUC 0.9992, MAE 5.59 vs naive 6.65
  - murllc: base rate 0.0287, Brier 0.00915 (constant 0.02787), AUC 0.9904, MAE 7.87 vs naive 7.68

## Overload

Under overload (offered load above the feasible fraction of capacity) the claim is only that URLLC and mURLLC are protected first and eMBB degrades; nothing here claims every SLA is met under overload. The lender reports the unfunded amount instead of hiding it.

| Scenario | Policy | URLLC+mURLLC violation rate | eMBB served ratio | SLA met (all, % of episodes) | Time in overload flag |
| --- | --- | ---: | ---: | ---: | ---: |
| Bots 3.0x | agent_shield | 0.0000 | 0.1671 | 0% | 0.0% |
| Bots 3.0x | enhanced | 0.0000 | 0.1671 | 0% | 98.9% |
| Bots 5.0x | agent_shield | 0.0000 | 0.0864 | 0% | 0.0% |
| Bots 5.0x | enhanced | 0.0000 | 0.0864 | 0% | 99.0% |
