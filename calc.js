// ════════════════════════════════════════════════════════════════════════
//  PGVCL BILL CALCULATOR — CALCULATION ENGINE
//  Author: B. H. Babariya, Dhoraji Division
//  v3 — Rate corrections, smart-meter off-peak TOU for RGP/GLP/WWSP
// ════════════════════════════════════════════════════════════════════════

function initCalc() {
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
  const hasHP       = cat.fixed_type === 'per_hp' || cat.fixed_type === 'hp_monthly_flat';

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
  toggleRow('tou-row',     cat.tou || hasSmartOffpeak);
  // If smart-meter off-peak only (no peak surcharge for this category), hide T1
  const t1Row = el('t1-field');
  if (t1Row) t1Row.style.display = cat.tou ? '' : 'none';
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

  el('ed_rate').value = cat.ed_pct;
  runCalc();
}

// ── MAIN CALCULATION ──────────────────────────────────────────────────
function runCalc() {
  const id         = document.getElementById('category').value;
  const cat        = CONFIG[id];
  const meterType  = el('meter_type').value;
  const cl         = fv('cl');
  const days       = fv('days') || 30;
  const kwh        = fv('kwh');
  const kvah       = fv('kvah');
  const kvarh      = fv('kvarh');
  const md         = fv('md');
  const t1         = fv('t1');
  const t3         = fv('t3');
  const edPct      = fv('ed_rate');
  const fcaRate    = fv('fca_rate');
  const skip_fixed = el('skip_fixed').checked;
  const voltKey    = el('voltage').value;
  const pro        = days / 30;

  const sections = [];
  let boardTotal = 0;

  const s1 = calcFixed(id, cat, cl, days, pro, md, skip_fixed);
  sections.push(s1); boardTotal += s1.total;

  const energyRates = getEnergyRates(cat, meterType);
  const s2 = calcEnergy(id, cat, cl, kwh, md, pro, energyRates);
  sections.push(s2); boardTotal += s2.total;

  const s3 = calcReactive(id, cat, kvarh);
  sections.push(s3); boardTotal += s3.total;

  const s4 = calcPF(cat, kwh, kvah, s2.total);
  sections.push(s4); boardTotal += s4.total;

  const s5 = calcVoltage(cat, voltKey, s2.total);
  sections.push(s5); boardTotal += s5.total;

  const s6 = calcTOU(id, cat, cl, md, t1, t3, meterType);
  sections.push(s6); boardTotal += s6.total;

  const s7 = calcFCA(cat, kwh, fcaRate);
  sections.push(s7); boardTotal += s7.total;

  const meterNote = {
    normal:         'Normal meter (post-paid) — standard tariff rates',
    smart_postpaid: 'Smart meter (post-paid) — same unit rates as normal; billing accuracy benefit',
    smart_prepaid:  'Smart prepaid meter — concessional energy rates applied above',
  }[meterType];

  const duty = cat.ed_pct === 0 ? 0 : boardTotal * (edPct / 100);
  renderManifest(sections, boardTotal, duty, edPct, meterNote, cat.ed_pct === 0);

  el('disp-board').textContent = fmt(boardTotal);
  el('disp-ed').textContent    = fmt(duty);
  el('disp-grand').textContent = fmt(boardTotal + duty);
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
    case 'hp_monthly_flat': {
      addLine(sec,'HP-Based Flat Charge',`${cl} HP × ₹${cat.hp_monthly_rate}/HP/month × ${pro.toFixed(2)} months`,cl*cat.hp_monthly_rate*pro);
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
      addLine(sec,`Billing Demand = max(${md} kVA actual, ${(0.85*cl).toFixed(1)} kVA (85% CD), ${cat.demand_floor_abs} kVA)`,`BD = ${bd.toFixed(2)} kVA`,0,'info');
      let rem=bd, prev=0;
      for (const [lim,rate] of cat.demand_tiers) {
        const band=Math.min(rem,lim-prev);
        if (band>0) addLine(sec,`Demand (${prev}–${lim===Infinity?'∞':lim} kVA @ ₹${rate}/kVA)`,`${band.toFixed(2)} kVA × ₹${rate}/kVA × ${pro.toFixed(2)} months`,band*rate*pro);
        rem-=band; prev=lim; if(rem<=0)break;
      }
      if (cat.demand_excess_rate) {
        const excess=Math.max(0,md-cl);
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
      const bd=calcBillingDemandKVA(cl,md,cat), htp1Rate=getHTP1DemandRate(bd), adjRate=htp1Rate*cat.demand_fraction;
      addLine(sec,`Billing Demand = max(${md} kVA actual, ${(0.85*cl).toFixed(1)} kVA (85% CD), ${cat.demand_floor_abs} kVA)`,`BD = ${bd.toFixed(2)} kVA`,0,'info');
      addLine(sec,`Demand Charge (1/3 of HTP-I rate ₹${htp1Rate}/kVA)`,`${bd.toFixed(2)} kVA × ₹${adjRate.toFixed(4)}/kVA × ${pro.toFixed(2)} months`,bd*adjRate*pro);
      const excess=Math.max(0,md-cl);
      if (excess>0&&cat.demand_excess_rate) addLine(sec,'Excess Demand Penalty',`${excess.toFixed(2)} kVA × ₹${cat.demand_excess_rate}/kVA × ${pro.toFixed(2)} months`,excess*cat.demand_excess_rate*pro,'penalty');
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
      const bd=calcBillingDemandKVA(cl,md,CONFIG[currentCatId()]);
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

  const pf = (kvah > 0) ? Math.min(1.0, kwh / kvah) : 1.0;
  let factor=0, desc='';

  if (pf >= 0.95) {
    const steps = Math.min(5, Math.floor((pf-0.95)*100));
    factor = -(steps*0.005);
    desc = steps>0 ? `PF ${pf.toFixed(3)} > 0.95: rebate ${steps}×0.5% = ${(Math.abs(factor)*100).toFixed(1)}%` : `PF ${pf.toFixed(3)} at threshold: no adjustment`;
  } else if (pf >= 0.90) {
    factor=0; desc=`PF ${pf.toFixed(3)} in neutral band (0.90–0.95): no adjustment`;
  } else if (pf >= 0.85) {
    const steps=Math.ceil((0.90-pf)*100); factor=steps*0.01;
    desc=`PF ${pf.toFixed(3)} below 0.90: ${steps}×1% = ${(factor*100).toFixed(1)}%`;
  } else {
    const stepsA=5, stepsB=Math.ceil((0.85-pf)*100); factor=(stepsA*0.01)+(stepsB*0.02);
    desc=`PF ${pf.toFixed(3)} below 0.85: 5×1% + ${stepsB}×2% = ${(factor*100).toFixed(1)}%`;
  }
  if (kvah<=0) desc='kVAh not entered — PF assumed 1.0. Enter kVAh above to calculate.';

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
function calcTOU(id, cat, cl, md, t1, t3, meterType) {
  const sec = sect('Time of Use (TOU) Charges');
  const hasSmartOffpeak = cat.tou_offpeak_smart && meterType !== 'normal';

  // Category has no TOU at all
  if (!cat.tou && !hasSmartOffpeak) {
    addLine(sec,'TOU — Not Applicable',
      id==='htp_4' ? 'HTP-IV (night-only) — no TOU differentiation needed'
      : 'TOU not applicable for this category', 0,'na');
    return sec;
  }

  // Smart-meter off-peak only (no peak surcharge — RGP, GLP, WWSP)
  if (!cat.tou && hasSmartOffpeak) {
    const offPeakRate = cat.tou_offpeak_smart_rate;
    const hours = cat.tou_offpeak_smart_hours || '11:00–17:00';
    if (t3 <= 0) {
      addLine(sec,'Off-Peak Discount — Smart Meter',
        `${hours}: enter off-peak units (T3) above to calculate ₹${Math.abs(offPeakRate).toFixed(2)}/unit rebate`,0,'na');
      return sec;
    }
    const offPeakAmt = t3 * offPeakRate;
    addLine(sec,`Off-Peak Rebate (${hours})`,
      `${t3} kWh × ₹${Math.abs(offPeakRate).toFixed(2)}/unit rebate`,
      offPeakAmt,'rebate');
    sec.total = offPeakAmt;
    return sec;
  }

  // Regular TOU (NRGP, LTMD, HT) — may also have smart off-peak
  if (cat.tou_min_cl > 0 && cl <= cat.tou_min_cl) {
    // NRGP ≤10kW: no peak surcharge, but still has off-peak discount
    if (hasSmartOffpeak && t3 > 0) {
      const offPeakAmt = t3 * (cat.tou_offpeak_rate || -0.60);
      addLine(sec,'TOU Peak — Not Applicable for this load',`CL ${cl} kW ≤ ${cat.tou_min_cl} kW threshold`,0,'na');
      addLine(sec,`Off-Peak Rebate (${cat.tou_offpeak_smart_hours||'11:00–17:00'})`,`${t3} kWh × ₹${Math.abs(cat.tou_offpeak_rate||0.60).toFixed(2)}/unit`,offPeakAmt,'rebate');
      sec.total = offPeakAmt;
    } else {
      addLine(sec,'TOU — Not Applicable for this load',`TOU (peak) applies only when CL > ${cat.tou_min_cl} kW`,0,'na');
    }
    return sec;
  }

  // Determine peak rate
  let peakRate;
  if (cat.tou_peak_tiered) {
    const bd=calcBillingDemandKVA(cl,md,cat);
    peakRate=cat.tou_peak_tiered[cat.tou_peak_tiered.length-1][1];
    for (const [lim,r] of cat.tou_peak_tiered) { if(bd<=lim){peakRate=r;break;} }
  } else {
    peakRate=cat.tou_peak_rate||0.45;
  }

  const offPeakRate = cat.tou_offpeak_rate || -0.60;
  const peakAmt    = t1 * peakRate;
  const offPeakAmt = t3 * offPeakRate;

  addLine(sec,'Peak Hour Surcharge (07:00–11:00 & 18:00–22:00)',
    `${t1} kWh × ₹${peakRate.toFixed(2)}/unit`, peakAmt, peakAmt<0?'rebate':'');
  addLine(sec,`Off-Peak Rebate (${cat.tou_offpeak_smart_hours||'11:00–17:00'})`,
    `${t3} kWh × ₹${Math.abs(offPeakRate).toFixed(2)}/unit rebate`, offPeakAmt,'rebate');

  sec.total = peakAmt + offPeakAmt;
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

// ── BILLING DEMAND HELPERS ────────────────────────────────────────────
function calcBillingDemandKW(cl,md,cat) { return Math.max(md,(cat.demand_floor_pct/100)*cl,cat.demand_floor_abs||0); }
function calcBillingDemandKVA(cl,md,cat){ return Math.max(md,(cat.demand_floor_pct/100)*cl,cat.demand_floor_abs||100); }
function getHTP1DemandRate(bd) {
  for (const [lim,r] of CONFIG.htp_1.demand_tiers) { if(bd<=lim) return r; }
  return CONFIG.htp_1.demand_tiers[CONFIG.htp_1.demand_tiers.length-1][1];
}
function isHTCategory(id)  { return id.startsWith('htp_'); }
function currentCatId()    { return document.getElementById('category').value; }

// ── RENDER ────────────────────────────────────────────────────────────
function renderManifest(sections, boardTotal, duty, edPct, meterNote, edExempt) {
  const container = el('manifest-list');
  container.innerHTML = '';
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
function fv(id)          { return parseFloat(el(id)?.value)||0; }
function fmt(n)          { return Math.abs(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtSigned(n)    { return n<0?`−₹${fmt(-n)}`:n===0?'₹0.00':`₹${fmt(n)}`; }
function toggleRow(id,show)    { const e=el(id); if(!e)return; e.style.display=show?'':'none'; }
function toggleBanner(id,show) { const e=el(id); if(!e)return; e.style.display=show?'flex':'none'; }

function resetForm() {
  el('cl').value='5'; el('days').value='30'; el('kwh').value='200';
  el('kvah').value='0'; el('kvarh').value='0'; el('md').value='0';
  el('t1').value='0'; el('t3').value='0';
  el('fca_rate').value='2.30'; el('meter_type').value='normal';
  el('skip_fixed').checked=false; el('category').value='rgp_u';
  initCalc();
}

document.addEventListener('DOMContentLoaded', () => { initCalc(); if(typeof lucide!=='undefined') lucide.createIcons(); });
