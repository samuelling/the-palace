T='"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true, "pi_model": "v3", "pi_source": "data", "sentinel_cap": true, "novice_cog": false'
python3 -W ignore tune16.py run cal_h5cap_nc "{$T}" 3 200 300 >> logs_calib3.txt 2>&1
python3 -W ignore tune16.py run cal_h5cap_nc_risk "{$T, \"effect\": 0.2}" 3 200 300 >> logs_calib3.txt 2>&1
echo DONE >> logs_calib3.txt
