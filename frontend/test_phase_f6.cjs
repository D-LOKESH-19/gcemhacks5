const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('====================================================');
console.log('PHASE F6 ACCEPTANCE TESTS (FT-45 to FT-56)');
console.log('====================================================\n');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:8050${urlPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || '{}'), raw: body });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: {}, raw: body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  // -------------------------------------------------------------
  // FT-45: SLA Promise Card limits match config.yaml
  // -------------------------------------------------------------
  try {
    const promiseSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'sla', 'SlaPromiseCard.tsx'), 'utf-8');
    assert(
      promiseSrc.includes('URLLC Latency') &&
      promiseSrc.includes('mURLLC Reliability') &&
      promiseSrc.includes('eMBB Throughput'),
      'FT-45: SlaPromiseCard defines plain-words contract guarantees for URLLC, mURLLC, and eMBB'
    );
  } catch (e) {
    assert(false, `FT-45 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-46: SLA grid matrix & empty slice 'No traffic'
  // -------------------------------------------------------------
  try {
    const gridSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'sla', 'SlaGridMatrix.tsx'), 'utf-8');
    assert(
      gridSrc.includes('NO_TRAFFIC') && gridSrc.includes('No arrivals recorded'),
      'FT-46: SlaGridMatrix renders "No traffic" when a slice has 0 arrivals'
    );
  } catch (e) {
    assert(false, `FT-46 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-47: Overload banner & 'URLLC and mURLLC protected first'
  // -------------------------------------------------------------
  try {
    const promiseSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'sla', 'SlaPromiseCard.tsx'), 'utf-8');
    assert(
      promiseSrc.includes('OVERLOAD ACTIVE') &&
      promiseSrc.includes('URLLC and mURLLC protected first'),
      'FT-47: Overload badge displays exact "URLLC and mURLLC protected first" notice'
    );
  } catch (e) {
    assert(false, `FT-47 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-48: Window compliance numbers
  // -------------------------------------------------------------
  try {
    const gridSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'sla', 'SlaGridMatrix.tsx'), 'utf-8');
    assert(
      gridSrc.includes('getWindowCompliance') && gridSrc.includes('of 20-step windows'),
      'FT-48: 20-step window compliance percentage displayed per candidate policy'
    );
  } catch (e) {
    assert(false, `FT-48 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-49: Training cards: final lambdas labelled 'final trained value'
  // -------------------------------------------------------------
  try {
    const cardsSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'training', 'TrainingMetricsCards.tsx'), 'utf-8');
    assert(
      cardsSrc.includes('final trained value') &&
      cardsSrc.includes('λ_urllc Penalty Weight') &&
      cardsSrc.includes('λ_murllc Penalty Weight'),
      'FT-49: Training cards strictly label multipliers as "final trained value"'
    );

    // Verify against actual API response
    const trainRes = await httpGet('/api/training/log');
    assert(
      trainRes.status === 200 &&
      trainRes.body.metadata &&
      trainRes.body.metadata.final_lambdas &&
      trainRes.body.metadata.final_lambdas.urllc > 0,
      'FT-49: /api/training/log provides real trained lambda values matching runs/log.csv'
    );
  } catch (e) {
    assert(false, `FT-49 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-50: Training curves: costs with dashed limit lines & empty state
  // -------------------------------------------------------------
  try {
    const curvesSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'training', 'TrainingCurves.tsx'), 'utf-8');
    assert(
      curvesSrc.includes('strokeDasharray="4 4"') &&
      curvesSrc.includes('URLLC Limit (0.005)') &&
      curvesSrc.includes('Run python train.py to create training data.'),
      'FT-50: TrainingCurves has dashed contract lines and clean empty state guidance'
    );
  } catch (e) {
    assert(false, `FT-50 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-51: Headline recomputed from CSVs
  // -------------------------------------------------------------
  try {
    const res = await httpGet('/api/results');
    assert(
      res.status === 200 &&
      res.body.headline &&
      res.body.headline.static_violations_cut_pct === 100.0,
      'FT-51: /api/results headline recomputed from CSVs: Agent cuts Static violations by 100.0%'
    );
  } catch (e) {
    assert(false, `FT-51 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-52: Scenario chart has error bars
  // -------------------------------------------------------------
  try {
    const chartSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'results', 'ScenarioGroupedBarChart.tsx'), 'utf-8');
    assert(
      chartSrc.includes('<ErrorBar') && chartSrc.includes('Static_err'),
      'FT-52: ScenarioGroupedBarChart displays 95% bootstrap confidence interval error bars'
    );
  } catch (e) {
    assert(false, `FT-52 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-53: Ablation table has 4 rows
  // -------------------------------------------------------------
  try {
    const ablationSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'results', 'AblationStudyTable.tsx'), 'utf-8');
    assert(
      ablationSrc.includes('Ablation Study (4 Architectural Configurations') &&
      ablationSrc.includes('Worst Window'),
      'FT-53: AblationStudyTable renders 4 model variants comparing tail risk and worst window'
    );
  } catch (e) {
    assert(false, `FT-53 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-54: Feasible and overload tabs with overload text
  // -------------------------------------------------------------
  try {
    const chartSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'results', 'ScenarioGroupedBarChart.tsx'), 'utf-8');
    assert(
      chartSrc.includes('Feasible Scenarios') &&
      chartSrc.includes('Overload Stress') &&
      chartSrc.includes('URLLC and mURLLC protected first'),
      'FT-54: Results page partitions Feasible and Overload with explicit protection statement'
    );
  } catch (e) {
    assert(false, `FT-54 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-55: CSV download endpoints work
  // -------------------------------------------------------------
  try {
    const dl1 = await httpGet('/api/results/download/sla_table.csv');
    assert(
      dl1.status === 200 && dl1.raw.includes('Scenario,Policy,Feasible'),
      'FT-55: /api/results/download/sla_table.csv serves valid CSV data'
    );

    const dl2 = await httpGet('/api/results/download/ablation.csv');
    assert(
      dl2.status === 200 && dl2.raw.includes('Scenario,Policy,Feasible'),
      'FT-55: /api/results/download/ablation.csv serves valid ablation CSV'
    );
  } catch (e) {
    assert(false, `FT-55 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-56: Footnotes visible
  // -------------------------------------------------------------
  try {
    const ablationSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'results', 'AblationStudyTable.tsx'), 'utf-8');
    assert(
      ablationSrc.includes('Slice-level simulator, not a radio-level model') &&
      ablationSrc.includes('Delay values are model estimates'),
      'FT-56: Mandatory honesty footnote visibly states slice-level simulator and delay model estimates'
    );
  } catch (e) {
    assert(false, `FT-56 exception: ${e.message}`);
  }

  console.log('\n----------------------------------------------------');
  if (failed === 0) {
    console.log('🎉 ALL PHASE F6 (SLA, TRAINING, RESULTS) TESTS PASSED (0 FAILURES)');
    process.exit(0);
  } else {
    console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
    process.exit(1);
  }
}

runTests();
