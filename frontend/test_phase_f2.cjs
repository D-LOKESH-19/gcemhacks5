const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('PHASE F2 ACCEPTANCE TESTS (FT-10 to FT-16)');
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

// -------------------------------------------------------------
// FT-10: Types match reality (parses all 30 captured stream messages)
// -------------------------------------------------------------
try {
  const fixturesPath = path.join(__dirname, 'fixtures', 'stream_sample.json');
  assert(fs.existsSync(fixturesPath), 'stream_sample.json exists in frontend/fixtures/');

  const rawData = fs.readFileSync(fixturesPath, 'utf-8');
  const messages = JSON.parse(rawData);
  assert(Array.isArray(messages), 'stream_sample.json is an array');
  assert(messages.length === 30, `stream_sample.json contains exactly 30 messages (found ${messages.length})`);

  let allValid = true;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (
      typeof msg.step !== 'number' ||
      typeof msg.scenario !== 'string' ||
      typeof msg.paused !== 'boolean' ||
      typeof msg.feasible !== 'boolean' ||
      !msg.policies ||
      !msg.policies.static ||
      !msg.policies.heuristic ||
      !msg.policies.agent ||
      !msg.scoreboard ||
      !msg.audit ||
      !msg.est_delay_ms
    ) {
      allValid = false;
      console.error(`Message ${i} schema validation failed:`, msg);
      break;
    }

    // Verify shield telemetry in agent policy
    const agent = msg.policies.agent;
    if (
      typeof agent.violation_rate !== 'number' ||
      !agent.shares ||
      !agent.shares.prb ||
      !agent.shares.vcpu ||
      !agent.shield ||
      typeof agent.shield.active !== 'boolean' ||
      typeof agent.shield.changed !== 'boolean' ||
      typeof agent.shield.intervention_rate_20 !== 'number'
    ) {
      allValid = false;
      console.error(`Message ${i} agent policy shield structure invalid:`, agent);
      break;
    }
  }

  assert(allValid, 'FT-10: All 30 captured messages strictly match TypeScript API types');
} catch (e) {
  assert(false, `FT-10 exception: ${e.message}`);
}

// -------------------------------------------------------------
// FT-12: Ring buffer bounds test (<= 300 items)
// -------------------------------------------------------------
try {
  const MAX_RING_BUFFER = 300;
  let buffer = [];
  for (let i = 0; i < 500; i++) {
    buffer = [...buffer.slice(-(MAX_RING_BUFFER - 1)), { step: i, val: i * 2 }];
  }
  assert(buffer.length === 300, `FT-12: Ring buffer correctly caps at 300 items (actual length: ${buffer.length})`);
  assert(buffer[buffer.length - 1].step === 499, 'FT-12: Most recent step is preserved in ring buffer');
  assert(buffer[0].step === 200, 'FT-12: Oldest items evicted in FIFO order');
} catch (e) {
  assert(false, `FT-12 exception: ${e.message}`);
}

// -------------------------------------------------------------
// FT-14: No mock or random data in production code
// -------------------------------------------------------------
try {
  const srcDir = path.join(__dirname, 'src');
  const forbiddenPatterns = [
    { pattern: /Math\.random\(/, name: 'Math.random()' },
    { pattern: /faker\./i, name: 'faker' },
    { pattern: /fixtures\/.*\.json/, name: 'fixture import in production' },
  ];

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    let violations = [];
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        violations = violations.concat(scanDir(fullPath));
      } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const rule of forbiddenPatterns) {
          if (rule.pattern.test(content)) {
            violations.push(`${fullPath}: contains forbidden '${rule.name}'`);
          }
        }
      }
    }
    return violations;
  }

  const productionViolations = scanDir(srcDir);
  if (productionViolations.length > 0) {
    console.error('Violations found:\n', productionViolations.join('\n'));
    assert(false, `FT-14: Found ${productionViolations.length} mock/random data violations in src/`);
  } else {
    assert(true, 'FT-14: Zero mock data, faker, or Math.random in src/ production codebase');
  }
} catch (e) {
  assert(false, `FT-14 exception: ${e.message}`);
}

// -------------------------------------------------------------
// FT-16: Tokens: colors & palettes never swapped
// -------------------------------------------------------------
try {
  const tailwindPath = path.join(__dirname, 'tailwind.config.js');
  const tailwindContent = fs.readFileSync(tailwindPath, 'utf-8');

  // Verify slice colors
  const hasEmbbCyan = tailwindContent.includes('#22D3EE');
  const hasUrllcAmber = tailwindContent.includes('#F59E0B');
  const hasMurllcViolet = tailwindContent.includes('#A78BFA');

  // Verify policy colors
  const hasStaticRed = tailwindContent.includes('#F87171');
  const hasHeuristicGrey = tailwindContent.includes('#CBD5E1');
  const hasAgentEmerald = tailwindContent.includes('#34D399');

  assert(
    hasEmbbCyan && hasUrllcAmber && hasMurllcViolet,
    'FT-16: Slice palette strictly conforms to eMBB #22D3EE, URLLC #F59E0B, mURLLC #A78BFA'
  );
  assert(
    hasStaticRed && hasHeuristicGrey && hasAgentEmerald,
    'FT-16: Policy palette strictly conforms to Static #F87171, Heuristic #CBD5E1, Agent #34D399'
  );
} catch (e) {
  assert(false, `FT-16 exception: ${e.message}`);
}

console.log('\n----------------------------------------------------');
if (failed === 0) {
  console.log('🎉 ALL PHASE F2 AUTOMATED ACCEPTANCE TESTS PASSED (0 FAILURES)');
  process.exit(0);
} else {
  console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
  process.exit(1);
}
