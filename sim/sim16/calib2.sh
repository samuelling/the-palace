T='"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true'
python3 -W ignore tune16.py run cal_h5 "{$T, \"pi_model\": \"v3\", \"pi_source\": \"data\"}" 3 200 300 >> logs_calib2.txt 2>&1
python3 -W ignore tune16.py run cal_h5cap "{$T, \"pi_model\": \"v3\", \"pi_source\": \"data\", \"sentinel_cap\": true}" 3 200 300 >> logs_calib2.txt 2>&1
python3 -W ignore tune16.py run cal_h5cap_risk "{$T, \"pi_model\": \"v3\", \"pi_source\": \"data\", \"sentinel_cap\": true, \"effect\": 0.2}" 3 200 300 >> logs_calib2.txt 2>&1
python3 -W ignore tune16.py run cal_v1_risk "{$T, \"effect\": 0.2}" 3 200 300 >> logs_calib2.txt 2>&1
python3 -W ignore reanalyze.py cal_v1 cal_v2data cal_h5 cal_h5cap cal_h5cap_risk cal_v1_risk >> logs_calib2.txt 2>&1
echo DONE >> logs_calib2.txt
