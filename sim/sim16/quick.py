import time, numpy as np, sim16
t = time.time(); rows = sim16.simulate({}, 6, 3, seed=1)
print('secs', round(time.time() - t, 1), 'rows', len(rows))
keys = ['e_pre_opt','e_post_opt','e_conf_plan','e_n_conf','e_bumps','e_err_eff','e_ret_eff','m_post_opt','m_conf_plan','m_n_conf','m_bumps','m_revisits','m_trans_eff','m_reward_eff','l_err','free_err','p_swap','p_rot','p_none','p_stale','p_n_swap','f_acc','f_rt','L_acc','L_rep','P_rho','minutes']
for g in ['healthy','prodromal','healthy_novice']:
    R = [r for r in rows if r['group'] == g]
    print(g[:9].ljust(10), ' '.join(f"{k}={np.nanmean([r[k] for r in R]):.2f}" for k in keys))
