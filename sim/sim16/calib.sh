T='"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true'
python3 -W ignore tune16.py run cal_v1 "{$T}" 3 200 300 >> logs_calib.txt 2>&1
python3 -W ignore tune16.py run cal_v2data "{$T, \"pi_model\": \"v2\", \"pi_source\": \"data\"}" 3 200 300 >> logs_calib.txt 2>&1
python3 -W ignore tune16.py run cal_v2assumed "{$T, \"pi_model\": \"v2\", \"pi_source\": \"assumed\"}" 3 200 300 >> logs_calib.txt 2>&1
echo DONE >> logs_calib.txt
