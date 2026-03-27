// ════════════════════════════════════════════════════════════════════════
//  PGVCL BILL CALCULATOR — TARIFF CONFIGURATION
//  Tariff Order: GERC, effective 01-April-2026 (FY 2026-27)
//  Author: B. H. Babariya, Dhoraji Division
//  v3 — Fixes: WWSP pre-paid rates (3 errors), RGP pre-paid 3rd slab (2 errors),
//       Added missing smart-meter off-peak TOU for RGP/GLP/WWSP categories.
//       All rates verified against official PGVCL Tariff Order (Pages 142-167).
//
//  SMART METER TOU OFF-PEAK (tou_offpeak_smart):
//    RGP / BPL / GLP: 60p rebate for 1100-1700 hrs — smart meter only
//    WWSP all types:  40p rebate for 1100-1800 hrs — smart meter / ToD meter
//    NRGP / LTMD / HT: already handled under regular tou / tou_offpeak_rate
//
//  ELECTRICITY DUTY:
//    Residential / HT: 15% on Board Charge
//    Commercial / Industrial (LT): 25% on Board Charge
//    Agriculture: Exempt
// ════════════════════════════════════════════════════════════════════════

const TARIFF_DATE = '01-April-2026';
const TARIFF_FY   = 'FY 2026-27';

const CATEGORIES = [
  ['rgp_u',        'LT Residential',    'RGP — Urban',                         'Urban residential consumers'],
  ['rgp_r',        'LT Residential',    'RGP — Rural (GP)',                    'Gram Panchayat area consumers'],
  ['rgp_u_bpl',    'LT Residential',    'RGP Urban — BPL',                     'Urban BPL consumers (concessional)'],
  ['rgp_r_bpl',    'LT Residential',    'RGP Rural — BPL',                     'Rural GP BPL consumers (concessional)'],
  ['nrgp',         'LT Commercial',     'Non-RGP (NRGP)',                      'Commercial / industrial ≤40 kW'],
  ['ltmd',         'LT Commercial',     'LTMD',                                'LT Max Demand >40 kW'],
  ['glp',          'LT Commercial',     'GLP',                                 'Street light / charity / R&D / educational'],
  ['tmp',          'LT Commercial',     'TMP',                                 'Temporary LT supply'],
  ['wwgp',         'LT Water Works',    'WWSP Type III — GP',                  'Water works in Gram/Nagar Panchayat areas'],
  ['wwlt2',        'LT Water Works',    'WWSP Type II — Local Authority',      'Water works: municipal / GWSSB outside GP'],
  ['wwpr',         'LT Water Works',    'WWSP Type I — Other Authority',       'Water works: other non-local authority'],
  ['ag_hp',        'LT Agriculture',    'AG — HP Based (Unmetered)',           'Flat rate per HP per month, no meter'],
  ['ag_metered',   'LT Agriculture',    'AG — Metered',                        'Agricultural metered supply'],
  ['ag_tatkal',    'LT Agriculture',    'AG — Tatkal',                         'Tatkal scheme (higher rate; metered)'],
  ['ltp_li',       'LT Agriculture',    'LTP — Lift Irrigation',               'LT lift irrigation (surface water, ≤180 HP)'],
  ['htp_1',        'HT General',        'HTP-I — General HT',                  'General HT supply ≥100 kVA'],
  ['htp_2',        'HT General',        'HTP-II — Water Works HT',             'HT water works (local authority, GWSSB, GIDC)'],
  ['htp_3',        'HT General',        'HTP-III — Temporary HT',              'Temporary HT supply ≥100 kVA'],
  ['htp_4',        'HT General',        'HTP-IV — Night Only HT',              'Night-only HT (22:00–06:00) ≥100 kVA'],
  ['htp_5',        'HT Agriculture',    'HTP-V — Lift Irrigation HT',          'HT agricultural lift irrigation ≥100 kVA'],
];

const CONFIG = {

  // ══════════════════════════════════════════════
  //  LT RESIDENTIAL
  // ══════════════════════════════════════════════

  rgp_u: {
    name: 'RGP — Urban',
    group: 'LT Residential',
    ed_pct: 15,
    fixed_type: 'bracket_kw',
    fixed: [[2,15],[4,25],[6,45],[Infinity,70]],
    energy_type: 'slab',
    // Post-paid / smart post-paid (Tariff §1.2)
    energy: [[50,3.05],[100,3.50],[250,4.15],[Infinity,5.20]],
    // Smart pre-paid (Tariff §1.2) — FIX: 3rd slab was 4.02, correct is 4.03 (403p)
    energy_prepaid: [[50,2.96],[100,3.40],[250,4.03],[Infinity,5.04]],
    tou: false,
    // Smart meter off-peak discount §1.4: 60p, 1100-1700 hrs
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Slab limits per calendar month; prorated for billing period length. Off-peak TOU only for smart meter consumers.',
  },

  rgp_r: {
    name: 'RGP — Rural (GP)',
    group: 'LT Residential',
    ed_pct: 15,
    fixed_type: 'bracket_kw',
    fixed: [[2,15],[4,25],[6,45],[Infinity,70]],
    energy_type: 'slab',
    energy: [[50,2.65],[100,3.10],[250,3.75],[Infinity,4.90]],
    energy_prepaid: [[50,2.57],[100,3.01],[250,3.64],[Infinity,4.75]],
    tou: false,
    // Smart meter off-peak discount §2.4: 60p, 1100-1700 hrs
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Rural (GP) rates lower than urban across all slabs.',
  },

  rgp_u_bpl: {
    name: 'RGP Urban — BPL',
    group: 'LT Residential',
    ed_pct: 15,
    fixed_type: 'flat',
    fixed_amount: 5,
    energy_type: 'slab',
    // BPL: 150p first 50u; above 50u at normal RGP Urban post-paid rates (§1.3)
    energy: [[50,1.50],[100,3.50],[250,4.15],[Infinity,5.20]],
    // Pre-paid: 146p first 50u; above 50u at normal RGP Urban pre-paid rates (§1.3)
    // FIX: 3rd slab was 4.02, correct is 4.03 (403p per tariff §1.2)
    energy_prepaid: [[50,1.46],[100,3.40],[250,4.03],[Infinity,5.04]],
    tou: false,
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Concessional first 50 units at 150p. BPL card required at sub-division office.',
  },

  rgp_r_bpl: {
    name: 'RGP Rural — BPL',
    group: 'LT Residential',
    ed_pct: 15,
    fixed_type: 'flat',
    fixed_amount: 5,
    energy_type: 'slab',
    energy: [[50,1.50],[100,3.10],[250,3.75],[Infinity,4.90]],
    energy_prepaid: [[50,1.46],[100,3.01],[250,3.64],[Infinity,4.75]],
    tou: false,
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Concessional first 50 units at 150p. Rural BPL list by State Govt.',
  },

  // ══════════════════════════════════════════════
  //  LT COMMERCIAL / INDUSTRIAL
  // ══════════════════════════════════════════════

  nrgp: {
    name: 'Non-RGP (NRGP)',
    group: 'LT Commercial',
    ed_pct: 25,
    fixed_type: 'tiered_kw',
    fixed_tiers: [[10,50],[40,85]],
    energy_type: 'flat_by_cl',
    energy: [[10,4.35],[Infinity,4.65]],
    energy_prepaid: [[10,4.22],[Infinity,4.51]],
    // TOU: peak surcharge only when CL > 10kW; off-peak discount all CL with smart meter
    tou: true,
    tou_min_cl: 10,
    tou_peak_rate: 0.45,
    tou_offpeak_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Peak TOU (+45p) only when CL>10kW. Off-peak discount (−60p) for smart/ToD meter. Consumer may opt LTMD instead.',
  },

  ltmd: {
    name: 'LTMD',
    group: 'LT Commercial',
    ed_pct: 25,
    fixed_type: 'demand_kw',
    demand_tiers: [[40,90],[60,130],[Infinity,195]],
    demand_floor_pct: 85,
    demand_floor_abs: 6,
    demand_excess_rate: 265,
    energy_type: 'flat',
    energy: [[Infinity,4.60]],
    energy_prepaid: [[Infinity,4.46]],
    reactive_energy_rate: 0.10,
    tou: true,
    tou_min_cl: 0,
    tou_peak_rate: 0.45,
    tou_offpeak_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Billing demand = max(actual MD, 85% CD, 6kW). Reactive energy billed at ₹0.10/kVARh.',
  },

  glp: {
    name: 'GLP',
    group: 'LT Commercial',
    ed_pct: 25,
    fixed_type: 'flat',
    fixed_amount: 70,
    energy_type: 'flat',
    energy: [[Infinity,3.90]],
    energy_prepaid: [[Infinity,3.78]],
    tou: false,
    // Smart meter off-peak discount §3.1: 60p, 1100-1700 hrs
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Fixed charge per installation (not per kW). For street lighting, charity, R&D, educational.',
  },

  tmp: {
    name: 'TMP (Temporary LT)',
    group: 'LT Commercial',
    ed_pct: 25,
    fixed_type: 'per_kw_per_day',
    fixed_rate_per_kw_day: 15,
    energy_type: 'flat',
    energy: [[Infinity,4.65]],
    energy_prepaid: [[Infinity,4.65]],
    tou: false,
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Bills payable within 7 days. Supply disconnected on 24-hour notice. Max period 6 months.',
  },

  // ══════════════════════════════════════════════
  //  LT WATER WORKS
  // ══════════════════════════════════════════════

  wwgp: {
    name: 'WWSP Type III — GP',
    group: 'LT Water Works',
    ed_pct: 25,
    fixed_type: 'none',
    energy_type: 'flat',
    energy: [[Infinity,3.20]],
    // FIX: was 3.20 (same as post-paid) — correct pre-paid rate is 310p = ₹3.10 (Tariff §7.3)
    energy_prepaid: [[Infinity,3.10]],
    tou: false,
    // Smart meter / ToD off-peak discount §7.4: 40p, 1100-1800 hrs
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.40,
    tou_offpeak_smart_hours: '11:00–18:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'No fixed charge. GP/Nagar Panchayat water works, GWSSB in GP areas. Off-peak TOU: 40p rebate 1100-1800.',
  },

  wwlt2: {
    name: 'WWSP Type II — Local Authority',
    group: 'LT Water Works',
    ed_pct: 25,
    fixed_type: 'per_hp',
    fixed_rate_per_hp: 20,
    energy_type: 'flat',
    energy: [[Infinity,4.10]],
    // FIX: was 4.10 (same as post-paid) — correct pre-paid rate is 398p = ₹3.98 (Tariff §7.2)
    energy_prepaid: [[Infinity,3.98]],
    tou: false,
    // Smart meter / ToD off-peak discount §7.4: 40p, 1100-1800 hrs
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.40,
    tou_offpeak_smart_hours: '11:00–18:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Municipal corporations, GWSSB outside GP, GIDC water supply. Off-peak TOU: 40p rebate 1100-1800.',
  },

  wwpr: {
    name: 'WWSP Type I — Other Authority',
    group: 'LT Water Works',
    ed_pct: 25,
    fixed_type: 'per_hp',
    fixed_rate_per_hp: 25,
    energy_type: 'flat',
    energy: [[Infinity,4.30]],
    // FIX: was 4.30 (same as post-paid) — correct pre-paid rate is 417p = ₹4.17 (Tariff §7.1)
    energy_prepaid: [[Infinity,4.17]],
    tou: false,
    // Smart meter / ToD off-peak discount §7.4: 40p, 1100-1800 hrs
    tou_offpeak_smart: true,
    tou_offpeak_smart_rate: -0.40,
    tou_offpeak_smart_hours: '11:00–18:00',
    pf_adj: false,
    voltage_rebate: false,
    fca: true,
    notes: 'Water works by authorities other than local bodies. Fixed at ₹25/HP/month. Off-peak TOU: 40p rebate 1100-1800.',
  },

  // ══════════════════════════════════════════════
  //  LT AGRICULTURE
  // ══════════════════════════════════════════════

  ag_hp: {
    name: 'AG — HP Based (Unmetered)',
    group: 'LT Agriculture',
    ed_pct: 0,
    fixed_type: 'hp_monthly_flat',
    hp_monthly_rate: 200,
    energy_type: 'none',
    tou: false,
    pf_adj: false,
    voltage_rebate: false,
    fca: false,
    notes: 'Unmetered flat rate. Bill = HP × ₹200 × months. FCA and ED exempt.',
  },

  ag_metered: {
    name: 'AG — Metered',
    group: 'LT Agriculture',
    ed_pct: 0,
    fixed_type: 'per_hp',
    fixed_rate_per_hp: 20,
    energy_type: 'flat',
    energy: [[Infinity,0.60]],
    energy_prepaid: [[Infinity,0.60]],
    tou: false,
    pf_adj: false,
    voltage_rebate: false,
    fca: false,
    notes: 'Metered agricultural supply. ED and FCA exempt. Fixed ₹20/HP/month.',
  },

  ag_tatkal: {
    name: 'AG — Tatkal',
    group: 'LT Agriculture',
    ed_pct: 0,
    fixed_type: 'per_hp',
    fixed_rate_per_hp: 20,
    energy_type: 'flat',
    energy: [[Infinity,0.80]],
    energy_prepaid: [[Infinity,0.80]],
    tou: false,
    pf_adj: false,
    voltage_rebate: false,
    fca: false,
    notes: 'Higher energy rate under Tatkal scheme. Eligible for normal rate after 5 years. ED and FCA exempt.',
  },

  ltp_li: {
    name: 'LTP — Lift Irrigation',
    group: 'LT Agriculture',
    ed_pct: 0,
    fixed_type: 'per_hp',
    fixed_rate_per_hp: 20,
    energy_type: 'flat',
    energy: [[Infinity,0.80]],
    energy_prepaid: [[Infinity,0.80]],
    tou: false,
    pf_adj: false,
    voltage_rebate: false,
    fca: false,
    notes: 'LT supply for lift irrigation from surface water. Limited to 180 HP. ED and FCA exempt.',
  },

  // ══════════════════════════════════════════════
  //  HIGH TENSION (HT)
  //  Contract demand ≥100 kVA
  //  Billing demand = max(actual MD, 85% CD, 100 kVA)
  // ══════════════════════════════════════════════

  htp_1: {
    name: 'HTP-I — General HT',
    group: 'HT General',
    ed_pct: 15,
    fixed_type: 'demand_kva',
    demand_tiers: [[500,150],[1000,260],[Infinity,475]],
    demand_floor_pct: 85,
    demand_floor_abs: 100,
    demand_excess_rate: 555,
    energy_type: 'flat_by_bd',
    energy: [[500,4.00],[2500,4.20],[Infinity,4.30]],
    energy_prepaid: null,
    tou: true,
    tou_min_cl: 0,
    tou_peak_tiered: [[500,0.45],[Infinity,0.85]],
    tou_offpeak_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: true,
    pf_rebate_above: 0.95,
    pf_neutral_low: 0.90,
    pf_penalty_1_below: 0.90,
    pf_penalty_2_below: 0.85,
    voltage_rebate: true,
    voltage_rebates: { '11':0.01, '66':0.015, '132':0.02 },
    fca: true,
    notes: 'Billing demand = max(actual MD, 85% CD, 100 kVA). TOU and PF apply.',
  },

  htp_2: {
    name: 'HTP-II — Water Works HT',
    group: 'HT General',
    ed_pct: 15,
    fixed_type: 'demand_kva',
    demand_tiers: [[500,115],[1000,225],[Infinity,290]],
    demand_floor_pct: 85,
    demand_floor_abs: 100,
    demand_excess_rate: 360,
    energy_type: 'flat_by_bd',
    energy: [[500,4.35],[2500,4.55],[Infinity,4.65]],
    energy_prepaid: null,
    tou: true,
    tou_min_cl: 0,
    tou_peak_tiered: [[500,0.45],[Infinity,0.85]],
    tou_offpeak_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: true,
    pf_rebate_above: 0.95,
    pf_neutral_low: 0.90,
    pf_penalty_1_below: 0.90,
    pf_penalty_2_below: 0.85,
    voltage_rebate: true,
    voltage_rebates: { '11':0.01, '66':0.015, '132':0.02 },
    fca: true,
    notes: 'HT water works: local authorities, GWSSB, GIDC. Lower demand rates than HTP-I.',
  },

  htp_3: {
    name: 'HTP-III — Temporary HT',
    group: 'HT General',
    ed_pct: 15,
    fixed_type: 'demand_kva_daily',
    demand_rate_per_day: 18,
    demand_excess_rate_per_day: 20,
    demand_floor_pct: 85,
    demand_floor_abs: 100,
    energy_type: 'flat',
    energy: [[Infinity,6.60]],
    energy_prepaid: null,
    tou: true,
    tou_min_cl: 0,
    tou_peak_tiered: null,
    tou_peak_rate: 0.85,
    tou_offpeak_rate: -0.60,
    tou_offpeak_smart_hours: '11:00–17:00',
    pf_adj: true,
    pf_rebate_above: 0.95,
    pf_neutral_low: 0.90,
    pf_penalty_1_below: 0.90,
    pf_penalty_2_below: 0.85,
    voltage_rebate: true,
    voltage_rebates: { '11':0.01, '66':0.015, '132':0.02 },
    fca: true,
    notes: 'Daily demand charge: ₹18/kVA/day (within CD) + ₹20/kVA/day excess. Energy 660p.',
  },

  htp_4: {
    name: 'HTP-IV — Night Only HT',
    group: 'HT General',
    ed_pct: 15,
    fixed_type: 'demand_kva_fraction_htp1',
    demand_fraction: 1/3,
    demand_floor_pct: 85,
    demand_floor_abs: 100,
    demand_excess_rate: 185,
    energy_type: 'flat',
    energy: [[Infinity,2.25]],
    energy_prepaid: null,
    tou: false,
    pf_adj: true,
    pf_rebate_above: 0.95,
    pf_neutral_low: 0.90,
    pf_penalty_1_below: 0.90,
    pf_penalty_2_below: 0.85,
    voltage_rebate: true,
    voltage_rebates: { '11':0.01, '66':0.015, '132':0.02 },
    fca: true,
    notes: 'Supply 22:00–06:00. Demand = 1/3 of HTP-I. No TOU (already off-peak). 15% demand / 10% units allowed in daytime.',
  },

  htp_5: {
    name: 'HTP-V — Lift Irrigation HT',
    group: 'HT Agriculture',
    ed_pct: 0,
    fixed_type: 'demand_kva',
    demand_tiers: [[Infinity,25]],
    demand_floor_pct: 85,
    demand_floor_abs: 100,
    demand_excess_rate: null,
    energy_type: 'flat',
    energy: [[Infinity,0.80]],
    energy_prepaid: null,
    tou: false,
    pf_adj: true,
    pf_rebate_above: 0.95,
    pf_neutral_low: 0.90,
    pf_penalty_1_below: 0.90,
    pf_penalty_2_below: 0.85,
    voltage_rebate: true,
    voltage_rebates: { '11':0.01, '66':0.015, '132':0.02 },
    fca: false,
    notes: 'HT agricultural lift irrigation. ED and FCA exempt. PF and voltage rebate apply. ₹25/kVA/month flat.',
  },
};
