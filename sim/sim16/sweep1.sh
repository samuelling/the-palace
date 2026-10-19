set -e
run() { python3 tune16.py run "$1" "$2" 1 >> logs_sweep1.txt 2>&1; }
python3 tune16.py run baseline_s2 '{}' 2 >> logs_sweep1.txt 2>&1
run lanterns8 '{"lantern_trials": 8}'
run lawn_large '{"lawn": "large"}'
run rt_zone '{"rt_timing": "zone"}'
run east_changes2 '{"east_changes": 2}'
run east_loops4 '{"east_loops": 4}'
run maze_closures4 '{"maze_closures": 4}'
run palace15 '{"palace_tests": 15}'
run swapmin30 '{"swap_min": 0.3}'
run sentinels18 '{"sentinels": 18}'
run pi_top '{"pi_view": "top"}'
run maze_top '{"maze_view": "top"}'
run no_ado '{"ado": false}'
echo DONE >> logs_sweep1.txt
