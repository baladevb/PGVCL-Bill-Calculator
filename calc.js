// ════════════════════════════════════════════════════════════════════════
//  PGVCL BILL CALCULATOR — CALCULATION ENGINE
//  Author: B. H. Babariya, Dhoraji Division
//  v3 — Rate corrections, smart-meter off-peak TOU for RGP/GLP/WWSP
// ════════════════════════════════════════════════════════════════════════

function initCalc(keepEd) {
  const id  = document.getElementById('category').value;
  const cat = CONFIG[id];
  const isHT = isHTCategory(id);
  const meterType = el('meter_type').value;

  // Category description
  const descEl = document.querySelector('#cat-desc span');
  if (descEl) {
    const catRow = CATEGORIES.find(r => r[0] === id);
    descEl.textContent = catRow ? catRow[3] : '';
  }

  // Demand type flags
  const isDemandKVA = ['demand_kva','demand_kva_daily','demand_kva_fraction_htp1'].includes(cat.fixed_type);
  const isDemandKW  = cat.fixed_type === 'demand_kw';
  const hasHP       = cat.fixed_type === 'per_hp' || cat.fixed_type === 'hp_yearly_flat';

  // Load label
  el('load-label').textContent =
    isDemandKVA ? 'Contract Demand (kVA)' :
    isDemandKW  ? 'Contract Demand (kW)'  :
    hasHP       ? 'Connected Load (HP)'   :
    cat.fixed_type === 'per_kw_per_day' ? 'Connected Load (kW)' : 'Connected Load (kW)';

  // MD label
  const mdLabelEl = el('md-label');
  if (mdLabelEl) mdLabelEl.textContent = isHT ? 'Max Demand Recorded (kVA)' : isDemandKW ? 'Max Demand Recorded (kW)' : 'Max Demand Recorded';

  // kVAh label
  const kvahLabelEl = el('kvah-label');
  if (kvahLabelEl) kvahLabelEl.textContent = isHT ? 'Apparent Energy kVAh (PF calc)' : 'Apparent Energy (kVAh)';

  // TOU off-peak label — shows hours relevant to category
  const t3LabelEl = el('t3-label');
  if (t3LabelEl) {
    const hours = cat.tou_offpeak_smart_hours || '11:00–17:00';
    t3LabelEl.textContent = `Off-Peak Units T3 (${hours})`;
  }

  // Does this category have smart-meter off-peak TOU (even when tou=false for peak)?
  const hasSmartOffpeak = cat.tou_offpeak_smart && meterType !== 'normal';

  // Row visibility
  toggleRow('md-row',      isDemandKW || isHT);
  toggleRow('kvah-row',    cat.pf_adj);
  toggleRow('kvarh-row',   id === 'ltmd');
  toggleRow('voltage-row', isHT);
  toggleRow('kwh-row',     cat.energy_type !== 'none');
  toggleRow('pf-ref-card', cat.pf_adj);

  // Banners
  toggleBanner('warn-ag-hp',  id === 'ag_hp');
  toggleBanner('warn-tatkal', id === 'ag_tatkal');
  toggleBanner('warn-tmp',    id === 'tmp');
  toggleBanner('warn-ltmd',   id === 'ltmd');
  toggleBanner('warn-ht',     isHT);
  toggleBanner('warn-smart-offpeak', hasSmartOffpeak && !cat.tou);

  // Smart pre-paid: disable for HT
  const meterSel   = el('meter_type');
  const prepaidOpt = meterSel.querySelector('option[value="smart_prepaid"]');
  if (isHT) {
    if (meterSel.value === 'smart_prepaid') meterSel.value = 'normal';
    prepaidOpt.disabled = true;
    prepaidOpt.title = 'Smart pre-paid tariff not specified for HT categories';
  } else {
    prepaidOpt.disabled = false;
    prepaidOpt.title = '';
  }

  if (!keepEd) el('ed_rate').value = cat.ed_pct;
  el('ed_rate').disabled = (cat.ed_pct === 0 && !cat.ed_editable);
  runCalc();
}

// ── TARIFF ROUNDING (General clause 8) ────────────────────────────────
// Fixed/demand billing is in multiples of 0.5 (fraction rounded UP to next 0.5);
// energy is billed on complete kWh (fractions dropped).
function ceilHalf(x)  { return Math.ceil(Math.round(x*2*1e6)/1e6)/2; }
function wholeUnits(x){ return Math.floor(Math.round(x*1e6)/1e6); }

// ── MAIN CALCULATION ──────────────────────────────────────────────────
function runCalc() {
  const id         = document.getElementById('category').value;
  const cat        = CONFIG[id];
  const meterType  = el('meter_type').value;
  const roundOn    = el('round_cl').checked;
  ROUND_ON         = roundOn;
  const days       = fv('days') || 30;
  const kvah       = fv('kvah');
  const edPct      = Math.min(100, fv('ed_rate'));
  const fcaRate    = fvAny('fca_rate');   // FCA can be a credit (negative)
  const fppasPct   = fvAny('fppas_rate');
  const skip_fixed = el('skip_fixed').checked;
  const voltKey    = el('voltage').value;
  const pro        = days / 30;

  // raw inputs vs. tariff-rounded values
  const clRaw=fv('cl'), mdRaw=fv('md'), kwhRaw=fv('kwh'), t1Raw=fv('t1'), t3Raw=fv('t3'), kvarhRaw=fv('kvarh');
  const cl    = roundOn ? ceilHalf(clRaw) : clRaw;
  const md    = roundOn ? ceilHalf(mdRaw) : mdRaw;
  const kwh   = roundOn ? wholeUnits(kwhRaw)   : kwhRaw;
  const t1    = roundOn ? wholeUnits(t1Raw)    : t1Raw;
  const t3    = roundOn ? wholeUnits(t3Raw)    : t3Raw;
  const kvarh = roundOn ? wholeUnits(kvarhRaw) : kvarhRaw;

  const seasonOn  = !!cat.seasonal && el('seasonal_on').checked;
  const offSeason = seasonOn && el('offseason_month').checked;

  updateTouUI(cat, cl, meterType);
  updateSeasonalUI(cat, seasonOn);
  toggleRow('green-rate-row', el('green_on').checked);

  const sections = [];
  let boardTotal = 0;

  let s1;
  if (offSeason) { s1 = sect('Fixed / Demand Charges'); naLine(s1,'—','Off-season month: no fixed/demand charge under the annual-minimum option'); }
  else s1 = calcFixed(id, cat, cl, days, pro, md, skip_fixed);
  sections.push(s1); boardTotal += s1.total;

  const energyRates = getEnergyRates(cat, meterType);
  const s2 = offSeason ? calcOffSeasonEnergy(cat, kwh) : calcEnergy(id, cat, cl, kwh, md, pro, energyRates);
  sections.push(s2); boardTotal += s2.total;

  const s3 = calcReactive(id, cat, kvarh);
  sections.push(s3); boardTotal += s3.total;

  const s4 = calcPF(cat, kwhRaw, kvah, s2.total);
  sections.push(s4); boardTotal += s4.total;

  const s5 = calcVoltage(cat, voltKey, s2.total);
  sections.push(s5); boardTotal += s5.total;

  let s6;
  if (offSeason) { s6 = sect('Time of Use (TOU) Charges'); addLine(s6,'TOU — Not Applicable','Off-season units are billed at a flat rate',0,'na'); }
  else s6 = calcTOU(id, cat, cl, md, t1, t3, meterType);
  sections.push(s6); boardTotal += s6.total;

  const s7 = calcFCA(cat, kwh, fcaRate);
  sections.push(s7); boardTotal += s7.total;

  const s8 = calcFPPAS(cat, s1, s2, s7, fppasPct);
  sections.push(s8); boardTotal += s8.total;

  if (el('green_on').checked) {
    const s9 = calcGreen(cat, kwh, fv('green_rate'));
    sections.push(s9); boardTotal += s9.total;
  }

  let meterNote = {
    normal:         'Normal meter (post-paid) — standard tariff rates',
    smart_postpaid: 'Smart meter (post-paid) — same unit rates as normal; billing accuracy benefit',
    smart_prepaid:  'Smart prepaid meter — concessional energy rates applied above',
  }[meterType];
  if (roundOn) {
    const ch=[];
    if (cl!==clRaw)   ch.push(`load ${clRaw} → ${cl}`);
    if (md!==mdRaw)   ch.push(`MD ${mdRaw} → ${md}`);
    if (kwh!==kwhRaw || t1!==t1Raw || t3!==t3Raw || kvarh!==kvarhRaw) ch.push('energy units dropped to whole kWh');
    if (ch.length) meterNote += `<br>Tariff clause 8 rounding applied: ${ch.join('; ')}`;
  }

  const warns = [];
  if (t1 + t3 > kwh && kwh > 0) warns.push('Peak + off-peak units (T1 + T3) exceed total kWh.');
  if (cat.pf_adj && kvah > 0 && kvah < kwhRaw) warns.push('kVAh is lower than kWh — PF is capped at 1.0. Check the readings.');
  if (id==='nrgp' && cl > 40) warns.push('NRGP applies up to 40 kW. Above 40 kW the consumer is billed under LTMD.');
  if (id==='ltp_li' && cl > 180) warns.push('LTP Lift Irrigation is for contracted load up to 180 HP.');
  if (isHTCategory(id) && cl > 0 && cl < 100) warns.push('HT categories need Contract Demand of at least 100 kVA.');
  if (kwhRaw !== Math.floor(kwhRaw) && !roundOn) warns.push('Energy has a fraction; the tariff bills complete kWh (clause 8).');

  const extra = [];
  if (seasonOn) extra.push(calcSeasonalMinimum(cat, cl, roundOn, offSeason, s1, s2));

  const edExempt = cat.ed_pct === 0 && !cat.ed_editable;
  const duty = edExempt ? 0 : boardTotal * (edPct / 100);
  renderManifest(sections, boardTotal, duty, edPct, meterNote, edExempt, extra, warns);

  el('disp-board').textContent = fmt(boardTotal);
  el('disp-ed').textContent    = fmt(duty);
  el('disp-grand').textContent = fmt(boardTotal + duty);
  const mb=el('mbar-total'); if (mb) mb.textContent = fmt(boardTotal + duty);
}

// ── SEASONAL CONSUMERS (annual minimum bill) ──────────────────────────
function updateSeasonalUI(cat, on) {
  toggleRow('seasonal-card',   !!cat.seasonal);
  toggleRow('seasonal-fields', !!cat.seasonal && on);
  toggleRow('sea-bd-fields',   cat.seasonal?.basis === 'bd');
  const h = el('seasonal-hint');
  if (h && cat.seasonal) {
    const z = cat.seasonal;
    h.textContent = `§${z.clause}: minimum ₹${z.min_per_unit_year}/${z.unit}/year; off-season units at ₹${z.offseason_rate.toFixed(2)}/unit`;
  }
}

function calcOffSeasonEnergy(cat, kwh) {
  const sec = sect('Energy Charges');
  const r = cat.seasonal.offseason_rate;
  addLine(sec,'Off-Season Flat Rate', `${kwh} kWh × ₹${r.toFixed(2)}/unit (seasonal consumer, off-season)`, kwh*r);
  sec.total = kwh*r;
  return sec;
}

// Year-end settlement: annual minimum vs. fixed/demand + energy billed in SEASON months.
// Not part of this month's bill total.
function calcSeasonalMinimum(cat, cl, roundOn, offSeason, s1, s2) {
  const z = cat.seasonal;
  const sec = sect('Seasonal Annual Minimum — year-end settlement (not in this month’s total)');
  let units, basisTxt;
  if (z.basis === 'cl') {
    units = cl; basisTxt = `Contracted/sanctioned load ${units} kW`;
  } else {
    const maxMD = fv('sea_maxmd'), avgCD = fv('sea_avgcd') || cl, floor = cat.demand_floor_abs;
    units = Math.max(maxMD, 0.85*avgCD, floor);
    if (roundOn) units = ceilHalf(units);
    basisTxt = `Annual billing demand = max(${maxMD} highest MD, ${(0.85*avgCD).toFixed(1)} (85% of avg CD ${avgCD}), ${floor}) = ${units} ${z.unit}`;
  }
  const minimum = units * z.min_per_unit_year;
  const prev = fv('sea_paid');
  const thisMonth = offSeason ? 0 : (s1.total + s2.total);
  const paid = prev + thisMonth;
  const shortfall = Math.max(0, minimum - paid);

  addLine(sec,'Annual Minimum (Fixed/Demand + Energy)', `${basisTxt}\n${units} ${z.unit} × ₹${z.min_per_unit_year}/${z.unit}/year`, minimum);
  addLine(sec,'Less: season-month charges billed',
    `₹${fmt(prev)} earlier months + ₹${fmt(thisMonth)} this month` + (offSeason ? ' (this is an off-season month — not counted)' : ''),
    -paid, 'rebate');
  addLine(sec, shortfall>0 ? 'Shortfall payable at year-end' : 'No shortfall — minimum already met',
    shortfall>0 ? 'Annual minimum exceeds season-month Fixed/Demand + Energy charges' : 'Season-month Fixed/Demand + Energy charges ≥ annual minimum',
    shortfall, shortfall>0 ? 'penalty' : 'na');
  sec.total = shortfall;
  return sec;
}

// ── GREEN POWER TARIFF (clause 18) ────────────────────────────────────
function calcGreen(cat, kwh, rate) {
  const sec = sect('Green Power Tariff');
  if (cat.energy_type === 'none') { addLine(sec,'Green Power — Not Applicable','Unmetered tariff: no kWh',0,'na'); return sec; }
  const v = kwh * rate;
  addLine(sec,'Green Power Tariff (RE opt-in)', `${kwh} kWh × ₹${rate.toFixed(2)}/unit — over and above normal tariff`, v);
  sec.total = v;
  return sec;
}

// ── FIXED / DEMAND ────────────────────────────────────────────────────
function calcFixed(id, cat, cl, days, pro, md, skip) {
  const sec = sect('Fixed / Demand Charges');
  if (skip) return naLine(sec, '—', 'Excluded by user selection');

  switch (cat.fixed_type) {
    case 'bracket_kw': {
      let rate = cat.fixed[cat.fixed.length-1][1];
      for (const [lim,r] of cat.fixed) { if (cl <= lim) { rate = r; break; } }
      addLine(sec, 'Fixed Charge', `CL ${cl} kW → bracket ₹${rate}/month × ${pro.toFixed(2)} months`, rate * pro);
      break;
    }
    case 'flat': {
      if (cat.fixed_amount === 0) { naLine(sec,'₹0.00','No fixed charge'); sec.total=0; return sec; }
      addLine(sec, 'Fixed Charge', `₹${cat.fixed_amount}/month × ${pro.toFixed(2)} months`, cat.fixed_amount * pro);
      break;
    }
    case 'none': {
      addLine(sec,'Fixed Charge — Not Applicable','No fixed charge for WWSP Type III (GP)',0,'na');
      break;
    }
    case 'per_hp': {
      addLine(sec,'Fixed Charge',`${cl} HP × ₹${cat.fixed_rate_per_hp}/HP × ${pro.toFixed(2)} months`,cl*cat.fixed_rate_per_hp*pro);
      break;
    }
    case 'hp_yearly_flat': {
      addLine(sec,'HP-Based Flat Charge',`${cl} HP × ₹${cat.hp_yearly_rate}/HP/year × ${days}/365 days`,cl*cat.hp_yearly_rate*days/365);
      break;
    }
    case 'per_kw_per_day': {
      addLine(sec,'Temporary Supply Fixed Charge',`${cl} kW × ₹${cat.fixed_rate_per_kw_day}/kW/day × ${days} days`,cl*cat.fixed_rate_per_kw_day*days);
      break;
    }
    case 'tiered_kw': {
      let rem=cl, prev=0;
      for (const [lim,rate] of cat.fixed_tiers) {
        const band=Math.min(rem,lim-prev);
        if (band>0) addLine(sec,`Fixed (${prev}–${lim===Infinity?'∞':lim} kW @ ₹${rate}/kW)`,`${band.toFixed(2)} kW × ₹${rate}/kW × ${pro.toFixed(2)} months`,band*rate*pro);
        rem-=band; prev=lim; if(rem<=0)break;
      }
      if (rem>0) { const lr=cat.fixed_tiers[cat.fixed_tiers.length-1][1];
        addLine(sec,`Fixed (above ${prev} kW @ ₹${lr}/kW) — outside this category`,`${rem.toFixed(2)} kW × ₹${lr}/kW × ${pro.toFixed(2)} months`,rem*lr*pro); }
      break;
    }
    case 'demand_kw': {
      const bd=calcBillingDemandKW(cl,md,cat), withinCD=Math.min(bd,cl);
      addLine(sec,`Billing Demand = max(${md} kW actual, ${(0.85*cl).toFixed(1)} kW (85% CD), ${cat.demand_floor_abs} kW)`,`BD = ${bd.toFixed(2)} kW`,0,'info');
      let rem=withinCD, prev=0;
      for (const [lim,rate] of cat.demand_tiers) {
        const band=Math.min(rem,lim-prev);
        if (band>0) addLine(sec,`Demand (${prev}–${lim===Infinity?'∞':Math.min(lim,cl)} kW @ ₹${rate}/kW)`,`${band.toFixed(2)} kW × ₹${rate}/kW × ${pro.toFixed(2)} months`,band*rate*pro);
        rem-=band; prev=lim; if(rem<=0)break;
      }
      const excess=Math.max(0,md-cl);
      if (excess>0) addLine(sec,'Excess Demand Penalty',`${excess.toFixed(2)} kW > CD × ₹${cat.demand_excess_rate}/kW × ${pro.toFixed(2)} months`,excess*cat.demand_excess_rate*pro,'penalty');
      break;
    }
    case 'demand_kva': {
      const bd=calcBillingDemandKVA(cl,md,cat);
      // Tariff: tiers apply to billing demand up to CD; demand above CD is charged at the excess rate only.
      // Categories with no excess rate (HTP-V) bill the whole billing demand at the normal tiers.
      const billable = cat.demand_excess_rate ? Math.min(bd,cl) : bd;
      addLine(sec,`Billing Demand = max(${md} kVA actual, ${(0.85*cl).toFixed(1)} kVA (85% CD), ${cat.demand_floor_abs} kVA)`,`BD = ${bd.toFixed(2)} kVA`,0,'info');
      let rem=billable, prev=0;
      for (const [lim,rate] of cat.demand_tiers) {
        const band=Math.min(rem,lim-prev);
        if (band>0) addLine(sec,`Demand (${prev}–${lim===Infinity?'∞':lim} kVA @ ₹${rate}/kVA)`,`${band.toFixed(2)} kVA × ₹${rate}/kVA × ${pro.toFixed(2)} months`,band*rate*pro);
        rem-=band; prev=lim; if(rem<=0)break;
      }
      if (cat.demand_excess_rate) {
        const excess=Math.max(0,bd-cl);
        if (excess>0) addLine(sec,'Excess Demand Penalty',`${excess.toFixed(2)} kVA > CD × ₹${cat.demand_excess_rate}/kVA × ${pro.toFixed(2)} months`,excess*cat.demand_excess_rate*pro,'penalty');
      }
      break;
    }
    case 'demand_kva_daily': {
      const bd=calcBillingDemandKVA(cl,md,cat), withinCD=Math.min(bd,cl);
      addLine(sec,`Billing Demand = max(${md} kVA actual, ${(0.85*cl).toFixed(1)} kVA (85% CD), ${cat.demand_floor_abs} kVA)`,`BD = ${bd.toFixed(2)} kVA`,0,'info');
      addLine(sec,`Demand Charge within CD (${days} days)`,`${withinCD.toFixed(2)} kVA × ₹${cat.demand_rate_per_day}/kVA/day × ${days} days`,withinCD*cat.demand_rate_per_day*days);
      const excess=Math.max(0,md-cl);
      if (excess>0) addLine(sec,'Excess Demand above CD',`${excess.toFixed(2)} kVA × ₹${cat.demand_excess_rate_per_day}/kVA/day × ${days} days`,excess*cat.demand_excess_rate_per_day*days,'penalty');
      break;
    }
    case 'demand_kva_fraction_htp1': {
      // HTP-IV demand = 1/3 of HTP-I fixed charges (tiered, up to CD) + excess at 1/3 of HTP-I excess rate
      const bd=calcBillingDemandKVA(cl,md,cat), withinCD=Math.min(bd,cl), f=cat.demand_fraction;
      addLine(sec,`Billing Demand = max(${md} kVA actual, ${(0.85*cl).toFixed(1)} kVA (85% CD), ${cat.demand_floor_abs} kVA)`,`BD = ${bd.toFixed(2)} kVA`,0,'info');
      let rem=withinCD, prev=0;
      for (const [lim,rate] of CONFIG.htp_1.demand_tiers) {
        const band=Math.min(rem,lim-prev), adj=rate*f;
        if (band>0) addLine(sec,`Demand (${prev}–${lim===Infinity?'∞':lim} kVA @ ₹${adj.toFixed(2)}/kVA = 1/3 of ₹${rate})`,`${band.toFixed(2)} kVA × ₹${adj.toFixed(4)}/kVA × ${pro.toFixed(2)} months`,band*adj*pro);
        rem-=band; prev=lim; if(rem<=0)break;
      }
      const excess=Math.max(0,bd-cl);
      if (excess>0&&cat.demand_excess_rate) addLine(sec,'Excess Demand Penalty',`${excess.toFixed(2)} kVA > CD × ₹${cat.demand_excess_rate}/kVA × ${pro.toFixed(2)} months`,excess*cat.demand_excess_rate*pro,'penalty');
      break;
    }
    default: addLine(sec,'Fixed Charge — Not Applicable','—',0,'na');
  }
  sec.total = sec.lines.reduce((s,l) => s+(l.amount||0), 0);
  return sec;
}

// ── ENERGY ────────────────────────────────────────────────────────────
function getEnergyRates(cat, meterType) {
  if (meterType === 'smart_prepaid' && cat.energy_prepaid) return cat.energy_prepaid;
  return cat.energy;
}

function calcEnergy(id, cat, cl, kwh, md, pro, rates) {
  const sec = sect('Energy Charges');
  if (cat.energy_type === 'none') { addLine(sec,'Energy Charge — Not Applicable','Unmetered tariff: no energy reading',0,'na'); return sec; }
  if (!rates) { addLine(sec,'Energy Charge — Not Applicable','—',0,'na'); return sec; }

  switch (cat.energy_type) {
    case 'slab': {
      let rem=kwh, prev=0;
      for (const [lim,rate] of rates) {
        const scaledLim = lim===Infinity ? Infinity : lim*pro;
        const slabUnits = lim===Infinity ? rem : Math.max(0, Math.min(rem, scaledLim-prev));
        if (slabUnits>0) addLine(sec,
          lim===Infinity ? `Above ${(prev/pro).toFixed(0)} u/month slab` : `${(prev/pro).toFixed(0)}–${lim} u/month slab`,
          `${slabUnits.toFixed(1)} units × ₹${rate.toFixed(2)}/unit`, slabUnits*rate);
        rem -= slabUnits;
        prev = lim===Infinity ? prev : scaledLim;
        if (rem<=0) break;
      }
      break;
    }
    case 'flat': {
      const rate=rates[0][1];
      addLine(sec,'Energy Charge',`${kwh} kWh × ₹${rate.toFixed(2)}/unit`,kwh*rate);
      break;
    }
    case 'flat_by_cl': {
      let rate=rates[rates.length-1][1];
      for (const [lim,r] of rates) { if(cl<=lim){rate=r;break;} }
      addLine(sec,`Energy Charge (CL ${cl<=10?'≤':'>'} 10 kW bracket)`,`${kwh} kWh × ₹${rate.toFixed(2)}/unit`,kwh*rate);
      break;
    }
    case 'flat_by_bd': {
      const bd=calcBillingDemandKVA(cl,md,cat);
      let rate=rates[rates.length-1][1];
      for (const [lim,r] of rates) { if(bd<=lim){rate=r;break;} }
      addLine(sec,`Energy Charge (BD ${bd.toFixed(0)} kVA tier)`,`${kwh} kWh × ₹${rate.toFixed(2)}/unit`,kwh*rate);
      break;
    }
  }
  sec.total = sec.lines.reduce((s,l) => s+(l.amount||0), 0);
  return sec;
}

// ── REACTIVE ENERGY (LTMD only) ───────────────────────────────────────
function calcReactive(id, cat, kvarh) {
  const sec = sect('Reactive Energy Charges');
  if (id !== 'ltmd' || !cat.reactive_energy_rate) { addLine(sec,'Reactive Energy — Not Applicable','kVARh charge applicable to LTMD only',0,'na'); return sec; }
  if (kvarh <= 0) { addLine(sec,'Reactive Energy (kVARh) — Enter value above','Rate: ₹0.10/kVARh. Enter kVARh from meter.',0,'na'); return sec; }
  addLine(sec,'Reactive Energy Charge',`${kvarh} kVARh × ₹${cat.reactive_energy_rate}/kVARh`,kvarh*cat.reactive_energy_rate);
  sec.total = kvarh * cat.reactive_energy_rate;
  return sec;
}

// ── POWER FACTOR (HT only) ────────────────────────────────────────────
function calcPF(cat, kwh, kvah, energyAmt) {
  const sec = sect('Power Factor (PF) Adjustment');
  if (!cat.pf_adj) { addLine(sec,'PF Adjustment — Not Applicable','PF adjustment applies to HT consumers only',0,'na'); return sec; }

  // Tariff: adjustment applies "for every 1% drop/rise or part thereof" → round UP to whole percent steps.
  // Values are rounded first so floating-point noise (e.g. 1.0000000000000009) can't add a step.
  const steps = x => Math.ceil(Math.round(x*1e6)/1e6);
  if (kvah <= 0) {
    addLine(sec,'PF — Enter kVAh','kVAh not entered: no PF adjustment applied. Enter kVAh above to calculate.',0,'na');
    return sec;
  }
  const pf = Math.round(Math.min(1.0, kwh / kvah)*1e6)/1e6;
  let factor=0, desc='';

  if (pf > 0.95) {
    const n = steps((pf-0.95)*100);
    factor = -(n*0.005);
    desc = `PF ${pf.toFixed(3)} above 0.95: rebate ${n}×0.5% = ${(Math.abs(factor)*100).toFixed(1)}%`;
  } else if (pf >= 0.90) {
    factor=0; desc=`PF ${pf.toFixed(3)} in neutral band (0.90–0.95): no adjustment`;
  } else if (pf >= 0.85) {
    const n=steps((0.90-pf)*100); factor=n*0.01;
    desc=`PF ${pf.toFixed(3)} below 0.90: ${n}×1% = ${(factor*100).toFixed(1)}%`;
  } else {
    const n2=steps((0.85-pf)*100); factor=(5*0.01)+(n2*0.02);
    desc=`PF ${pf.toFixed(3)} below 0.85: 5×1% + ${n2}×2% = ${(factor*100).toFixed(1)}%`;
  }

  const adj=energyAmt*factor;
  addLine(sec, factor<0?'PF Rebate':factor>0?'PF Penalty':'PF — No Adjustment',
    `${desc}\nEnergy ₹${energyAmt.toFixed(2)} × ${(factor*100).toFixed(2)}%`,
    adj, factor<0?'rebate':factor>0?'penalty':'na');
  sec.total=adj;
  return sec;
}

// ── VOLTAGE REBATE (HT only) ──────────────────────────────────────────
function calcVoltage(cat, voltKey, energyAmt) {
  const sec = sect('Voltage Rebate');
  if (!cat.voltage_rebate) { addLine(sec,'Voltage Rebate — Not Applicable','Applies to HT consumers only',0,'na'); return sec; }
  const pct=cat.voltage_rebates[voltKey]||0.01;
  const labels={'11':'11/22 kV (HV)','66':'33/66 kV (EHV)','132':'132 kV and above (EHV)'};
  const adj=-energyAmt*pct;
  addLine(sec,`Rebate — ${labels[voltKey]||'11/22 kV'}`,`Energy ₹${energyAmt.toFixed(2)} × ${(pct*100).toFixed(1)}%`,adj,'rebate');
  sec.total=adj;
  return sec;
}

// ── TIME OF USE ───────────────────────────────────────────────────────
// Which TOU components apply (Tariff Schedule):
//   Peak surcharge  : NRGP only when CL > 10 kW; LTMD, HTP-I/II/III always.
//   Off-peak rebate : RGP/BPL/GLP/WWSP → smart meter; NRGP ≤10 kW → smart meter;
//                     NRGP >10 kW, LTMD, HTP-I/II → ToD/smart meter (T3 entry implies one);
//                     HTP-III → no off-peak rebate in the tariff.
function touFlags(cat, cl, meterType) {
  const smart   = meterType !== 'normal';
  const lowLoad = cat.tou_min_cl > 0 && cl <= cat.tou_min_cl;
  const peak    = !!cat.tou && !lowLoad;
  let offpeak;
  if (cat.tou_no_offpeak)  offpeak = false;
  else if (!cat.tou)       offpeak = !!cat.tou_offpeak_smart && smart;
  else                     offpeak = lowLoad ? smart : true;
  return { peak, offpeak, lowLoad };
}

function updateTouUI(cat, cl, meterType) {
  const f = touFlags(cat, cl, meterType);
  toggleRow('tou-row', f.peak || f.offpeak);
  const t1Row = el('t1-field'); if (t1Row) t1Row.style.display = f.peak ? '' : 'none';
  const t3Row = el('t3-field'); if (t3Row) t3Row.style.display = f.offpeak ? '' : 'none';
}

function calcTOU(id, cat, cl, md, t1, t3, meterType) {
  const sec = sect('Time of Use (TOU) Charges');
  const { peak, offpeak, lowLoad } = touFlags(cat, cl, meterType);
  const hours = cat.tou_offpeak_smart_hours || '11:00–17:00';

  if (!peak && !offpeak) {
    let why = 'TOU not applicable for this category';
    if (id==='htp_4') why = 'HTP-IV (night-only) — no TOU differentiation needed';
    else if (cat.tou_no_offpeak) why = 'HTP-III: no TOU discount in tariff, and peak surcharge is not applicable here';
    else if (cat.tou && lowLoad) why = `Peak surcharge applies only when CL > ${cat.tou_min_cl} kW; off-peak discount (${hours}) needs a smart meter`;
    else if (cat.tou_offpeak_smart) why = `Off-peak discount (${hours}) applies to smart-meter consumers only`;
    addLine(sec,'TOU — Not Applicable', why, 0,'na');
    return sec;
  }

  if (cat.tou && lowLoad) {
    addLine(sec,'TOU Peak — Not Applicable for this load',`CL ${cl} kW ≤ ${cat.tou_min_cl} kW threshold`,0,'na');
  }

  if (peak) {
    let peakRate;
    if (cat.tou_peak_tiered) {
      const bd=calcBillingDemandKVA(cl,md,cat);
      peakRate=cat.tou_peak_tiered[cat.tou_peak_tiered.length-1][1];
      for (const [lim,r] of cat.tou_peak_tiered) { if(bd<=lim){peakRate=r;break;} }
    } else {
      peakRate=cat.tou_peak_rate||0.45;
    }
    addLine(sec,'Peak Hour Surcharge (07:00–11:00 & 18:00–22:00)',
      `${t1} kWh × ₹${peakRate.toFixed(2)}/unit`, t1*peakRate);
  }

  if (offpeak) {
    const rate = cat.tou ? (cat.tou_offpeak_rate ?? -0.60) : cat.tou_offpeak_smart_rate;
    if (!peak && t3 <= 0) {
      addLine(sec,'Off-Peak Discount — Smart Meter',
        `${hours}: enter off-peak units (T3) above to calculate ₹${Math.abs(rate).toFixed(2)}/unit rebate`,0,'na');
    } else {
      addLine(sec,`Off-Peak Rebate (${hours})`,
        `${t3} kWh × ₹${Math.abs(rate).toFixed(2)}/unit rebate`, t3*rate,'rebate');
    }
  }

  sec.total = sec.lines.reduce((s,l) => s+(l.amount||0), 0);
  return sec;
}

// ── FCA / FPPPA ───────────────────────────────────────────────────────
function calcFCA(cat, kwh, fcaRate) {
  const sec = sect('FPPPA / FCA');
  if (!cat.fca) { addLine(sec,'FCA — Exempt','Agriculture / HTP-V: FCA not applicable',0,'na'); return sec; }
  if (cat.energy_type==='none') { addLine(sec,'FCA — Not Applicable','Unmetered tariff: no kWh for FCA',0,'na'); return sec; }
  const v=kwh*fcaRate;
  addLine(sec,'Fuel & Power Purchase Adjustment',`${kwh} kWh × ₹${fcaRate.toFixed(2)}/unit`,v);
  sec.total=v;
  return sec;
}

// ── FPPAS (% of Fixed + Energy + FCA; excess-MD penalty excluded) ─────
function calcFPPAS(cat, sFixed, sEnergy, sFCA, pct) {
  const sec = sect('FPPAS');
  if (!cat.fca) { addLine(sec,'FPPAS — Exempt','Agriculture / HTP-V: FPPAS not applicable',0,'na'); return sec; }
  if (cat.energy_type==='none') { addLine(sec,'FPPAS — Not Applicable','Unmetered tariff: no FPPAS',0,'na'); return sec; }
  const penalty = sFixed.lines.filter(l => l.type==='penalty').reduce((s,l) => s+(l.amount||0), 0);
  const fixedBase = sFixed.total - penalty;
  const base = fixedBase + sEnergy.total + sFCA.total;
  const v = base * (pct/100);
  addLine(sec,`FPPAS @ ${pct}%`,
    `(Fixed ₹${fmt(fixedBase)} + Energy ₹${fmt(sEnergy.total)} + FCA ₹${fmt(sFCA.total)}) = ₹${fmt(base)} × ${pct}%`
    + (penalty>0 ? `\nExcess MD penalty ₹${fmt(penalty)} excluded` : ''), v);
  sec.total=v;
  return sec;
}

// ── BILLING DEMAND HELPERS ────────────────────────────────────────────
let ROUND_ON = true;   // set from the clause-8 checkbox in runCalc()
function calcBillingDemandKW(cl,md,cat) { const v=Math.max(md,(cat.demand_floor_pct/100)*cl,cat.demand_floor_abs||0);   return ROUND_ON ? ceilHalf(v) : v; }
function calcBillingDemandKVA(cl,md,cat){ const v=Math.max(md,(cat.demand_floor_pct/100)*cl,cat.demand_floor_abs||100); return ROUND_ON ? ceilHalf(v) : v; }
function isHTCategory(id)  { return (CONFIG[id]?.group||'').startsWith('HT'); }
function currentCatId()    { return document.getElementById('category').value; }

// ── RENDER ────────────────────────────────────────────────────────────
function renderManifest(sections, boardTotal, duty, edPct, meterNote, edExempt, extraSections, warns) {
  const container = el('manifest-list');
  container.innerHTML = '';
  (warns||[]).forEach(w => {
    const d=document.createElement('div');
    d.className='calc-warn';
    d.textContent='⚠ '+w;
    container.appendChild(d);
  });
  sections.forEach(sec => {
    const allNA  = sec.lines.every(l => l.type==='na'||l.type==='info');
    const secDiv = document.createElement('div');
    secDiv.className = 'sec'+(allNA?' sec-na':'');
    const tcls = sec.total<0?'val-rebate':'';
    secDiv.innerHTML = `
      <div class="sec-head">
        <span class="sec-title">${sec.label}</span>
        <span class="sec-total ${tcls}">${allNA?'—':fmtSigned(sec.total)}</span>
      </div>
      ${sec.lines.map(l=>lineHTML(l)).join('')}`;
    container.appendChild(secDiv);
  });

  const sub=document.createElement('div');
  sub.className='subtotal-box';
  sub.innerHTML=`<span>Board Charge Sub-total</span><span>₹${fmt(boardTotal)}</span>`;
  container.appendChild(sub);

  const edDiv=document.createElement('div');
  edDiv.className='sec'+(edExempt?' sec-na':'');
  edDiv.innerHTML = edExempt
    ? `<div class="sec-head"><span class="sec-title">Electricity Duty (ED)</span><span class="sec-total">Exempt</span></div><div class="line"><div class="line-lhs"><div class="line-name">ED Exempt</div><div class="line-calc">Agriculture: exempt from Electricity Duty</div></div><div class="line-val na-val">N/A</div></div>`
    : `<div class="sec-head"><span class="sec-title">Electricity Duty (ED)</span><span class="sec-total">₹${fmt(duty)}</span></div><div class="line"><div class="line-lhs"><div class="line-name">ED @ ${edPct}%</div><div class="line-calc">Board Charge ₹${fmt(boardTotal)} × ${edPct}%</div></div><div class="line-val">₹${fmt(duty)}</div></div>`;
  container.appendChild(edDiv);

  (extraSections||[]).forEach(sec => {
    const d=document.createElement('div');
    d.className='sec';
    d.innerHTML=`
      <div class="sec-head">
        <span class="sec-title">${sec.label}</span>
        <span class="sec-total">${fmtSigned(sec.total)}</span>
      </div>
      ${sec.lines.map(l=>lineHTML(l)).join('')}`;
    container.appendChild(d);
  });

  const noteDiv=document.createElement('div');
  noteDiv.className='meter-note';
  noteDiv.innerHTML=`<i data-lucide="info" style="width:11px;flex-shrink:0"></i> ${meterNote}`;
  container.appendChild(noteDiv);
  if (typeof lucide!=='undefined') lucide.createIcons();
}

function lineHTML(l) {
  if (l.type==='info') return `<div class="line info-line"><div class="line-lhs"><div class="line-name">${l.name}</div><div class="line-calc">${l.calc}</div></div><div class="line-val info-val">—</div></div>`;
  const cls=l.type==='na'?'na-val':l.type==='rebate'?'rebate-val':l.type==='penalty'?'penalty-val':'';
  const valStr=l.type==='na'?'N/A':fmtSigned(l.amount);
  return `<div class="line ${l.type==='na'?'line-na':''}"><div class="line-lhs"><div class="line-name">${l.name}</div><div class="line-calc">${(l.calc||'').replace(/\n/g,'<br>')}</div></div><div class="line-val ${cls}">${valStr}</div></div>`;
}

function sect(label)     { return {label,lines:[],total:0}; }
function addLine(sec,name,calc,amount,type='') { sec.lines.push({name,calc,amount:amount||0,type}); }
function naLine(sec,_s,reason) { sec.lines.push({name:'Not Applicable',calc:reason,amount:0,type:'na'}); sec.total=0; return sec; }
function el(id)          { return document.getElementById(id); }
function fvAny(id)       { return parseFloat(el(id)?.value)||0; }
function fv(id)          { return Math.max(0, fvAny(id)); }
function fmt(n)          { return Math.abs(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtSigned(n)    { return n<0?`−₹${fmt(-n)}`:n===0?'₹0.00':`₹${fmt(n)}`; }
function toggleRow(id,show)    { const e=el(id); if(!e)return; e.style.display=show?'':'none'; }
function toggleBanner(id,show) { const e=el(id); if(!e)return; e.style.display=show?'flex':'none'; }

// Mobile: jump between the form and the charge breakdown
function toggleMobileView() {
  const card = el('manifest-card'), btn = el('mbar-btn-txt');
  const inResults = card.getBoundingClientRect().top < window.innerHeight * 0.5;
  if (inResults) { window.scrollTo({top:0, behavior:'smooth'}); btn.textContent='Breakdown'; }
  else { card.scrollIntoView({behavior:'smooth', block:'start'}); btn.textContent='Edit inputs'; }
}
window.addEventListener('scroll', () => {
  const card = el('manifest-card'), btn = el('mbar-btn-txt');
  if (!card || !btn) return;
  btn.textContent = card.getBoundingClientRect().top < window.innerHeight * 0.5 ? 'Edit inputs' : 'Breakdown';
}, {passive:true});

function resetForm() {
  el('cl').value='5'; el('days').value='30'; el('kwh').value='200';
  el('kvah').value='0'; el('kvarh').value='0'; el('md').value='0';
  el('t1').value='0'; el('t3').value='0';
  el('fca_rate').value='2.30'; el('fppas_rate').value='3.99';
  el('round_cl').checked=true; el('green_on').checked=false; el('green_rate').value='0.75';
  el('seasonal_on').checked=false; el('offseason_month').checked=false;
  el('sea_paid').value='0'; el('sea_maxmd').value='0'; el('sea_avgcd').value='0'; el('meter_type').value='normal';
  el('skip_fixed').checked=false; el('category').value='rgp_u';
  initCalc();
}

document.addEventListener('DOMContentLoaded', () => { initCalc(); if(typeof lucide!=='undefined') lucide.createIcons(); });
