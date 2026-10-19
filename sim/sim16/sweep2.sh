run() { python3 tune16.py run "$1" "$2" 1 200 300 >> logs_sweep2.txt 2>&1; }
run base200 '{}'
run c1 '{"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4}'
run c2 '{"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true}'
run c3 '{"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true, "sentinels": 18}'
run c4 '{"rt_timing": "zone", "lantern_trials": 8, "east_loops": 4, "fp_warmup": true, "maze_view": "top"}'
echo DONE >> logs_sweep2.txt
