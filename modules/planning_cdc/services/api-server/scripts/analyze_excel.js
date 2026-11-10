const XLSX = require('xlsx');
const wb = XLSX.readFile('../2026 ACDC Workplan - AMERT Extract.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws);

// Check budget fields
console.log('All column names:', Object.keys(data[0]).join(', '));
data.slice(0, 3).forEach((r, i) => {
  console.log('Row ' + i + ' budgets: Main=' + r.Main_Budget + ', Pass=' + r.Pass_Though + ', TA=' + r.Tech_Assist + ', Spec=' + r.Special + ', Total=' + r.Total_Budget);
});

// Find rows with actual budget values
const withBudget = data.filter(r => r.Total_Budget > 0);
console.log('\nRows with budget > 0:', withBudget.length);
withBudget.slice(0, 3).forEach(r => {
  console.log('  Total=' + r.Total_Budget + ' | ' + (r.Activity || '').substring(0, 50));
});

// Budget per activity
const actBudgets = {};
data.forEach(r => {
  const act = r.Activity;
  if (act && r.Total_Budget > 0) {
    actBudgets[act] = r.Total_Budget;
  }
});
let grandTotal = 0;
Object.values(actBudgets).forEach(v => grandTotal += v);
console.log('\nActivities with budget:', Object.keys(actBudgets).length);
console.log('Grand total budget:', grandTotal.toLocaleString());

// T2 indicators with baselines & targets
const t2data = {};
data.forEach(r => {
  const indName = (r.Opt_Indicator || '').trim();
  if (indName && !t2data[indName]) {
    t2data[indName] = {
      baseline: r.Opt_Baseline,
      q1: r.Q1_Target,
      q2: r.Q2_Target,
      q3: r.Q3_Target,
      q4: r.Q4_Target,
      unit: r.Opt_Measuring_Unit,
      mov: r.Opt_Means_of_Ver,
      output: (r.Output || '').substring(0, 40),
    };
  }
});

console.log('\n=== T2 Indicators with Baselines & Targets ===');
Object.entries(t2data).forEach(([name, d]) => {
  console.log(d.output + ' | ' + name.substring(0, 60) + ' | base:' + d.baseline + ' Q1:' + d.q1 + ' Q2:' + d.q2 + ' Q3:' + d.q3 + ' Q4:' + d.q4 + ' | ' + d.unit);
});
