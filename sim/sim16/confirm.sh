python3 tune16.py run confirm_base '{}' 3 200 300 >> logs_confirm.txt 2>&1
python3 tune16.py run confirm_tuned '{"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true}' 3 200 300 >> logs_confirm.txt 2>&1
echo DONE >> logs_confirm.txt
