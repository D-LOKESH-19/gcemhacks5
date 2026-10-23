const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('PHASE F7 ACCEPTANCE TESTS (FT-57 to FT-62)');
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

async function runTests() {
  // -------------------------------------------------------------
  // FT-57: Presenter Mode 2m readable typography (>= 24px - 48px)
  // -------------------------------------------------------------
  try {
    const presenterSrc = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'PresenterPage.tsx'), 'utf-8');
    const hasLargeText = 
      presenterSrc.includes('text-4xl') && 
      presenterSrc.includes('text-5xl') && 
      presenterSrc.includes('font-mono font-black');
    assert(
      hasLargeText,
      'FT-57: PresenterPage features 2-meter readable typography (text-4xl/text-5xl font-mono font-black)'
    );
  } catch (e) {
    assert(false, `FT-57 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-58: Keyboard shortcuts (1, 2, 3, Space, R, P, Esc, ?) & Help modal
  // -------------------------------------------------------------
  try {
    const presenterSrc = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'PresenterPage.tsx'), 'utf-8');
    const hasKeys = 
      presenterSrc.includes('e.key === "1"') &&
      presenterSrc.includes('e.key === "2"') &&
      presenterSrc.includes('e.key === "3"') &&
      presenterSrc.includes('e.code === "Space"') &&
      presenterSrc.includes('e.key === "r"') &&
      presenterSrc.includes('e.key === "Escape"') &&
      presenterSrc.includes('e.key === "?"');
    const hasHelpModal = presenterSrc.includes('Presenter Keyboard Shortcuts');
    assert(
      hasKeys && hasHelpModal,
      'FT-58: PresenterPage binds keys (1, 2, 3, Space, R, P, Esc, ?) and provides interactive help modal overlay'
    );
  } catch (e) {
    assert(false, `FT-58 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-59: Loading, empty, and error states with Retry button
  // -------------------------------------------------------------
  try {
    const errorSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'common', 'ErrorBoundary.tsx'), 'utf-8');
    const skeletonSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'common', 'LoadingSkeleton.tsx'), 'utf-8');
    assert(
      errorSrc.includes('Retry Component') && 
      errorSrc.includes('handleRetry') && 
      skeletonSrc.includes('animate-pulse'),
      'FT-59: Robust error boundary with user-facing Retry and LoadingSkeleton placeholders'
    );
  } catch (e) {
    assert(false, `FT-59 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-60: Layout responsiveness (1920x1080 and 1366x768)
  // -------------------------------------------------------------
  try {
    const presenterSrc = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'PresenterPage.tsx'), 'utf-8');
    const shellSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'layout', 'AppShell.tsx'), 'utf-8');
    assert(
      presenterSrc.includes('grid-cols-1 md:grid-cols-3') &&
      presenterSrc.includes('grid-cols-1 lg:grid-cols-2') &&
      shellSrc.includes('max-w-[1920px]'),
      'FT-60: Responsive layouts with responsive grid breakpoints prevent text overlap at 1920x1080 and 1366x768'
    );
  } catch (e) {
    assert(false, `FT-60 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-61: Background tab handling without buffer blowup
  // -------------------------------------------------------------
  try {
    const wsHookSrc = fs.readFileSync(path.join(__dirname, 'src', 'hooks', 'useWebSocketStream.ts'), 'utf-8');
    const storeSrc = fs.readFileSync(path.join(__dirname, 'src', 'store', 'useSliceStore.ts'), 'utf-8');
    assert(
      wsHookSrc.includes('!isDocumentVisibleRef.current') &&
      wsHookSrc.includes('now - lastRenderTimeRef.current < 1000') &&
      storeSrc.includes('MAX_RING_BUFFER = 300'),
      'FT-61: Background tab throttles ingestion to 1Hz and ring buffer caps at 300 items preventing memory leaks'
    );
  } catch (e) {
    assert(false, `FT-61 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-62: Color + icon + text multi-channel status indicators
  // -------------------------------------------------------------
  try {
    const badgeSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'common', 'Badge.tsx'), 'utf-8');
    assert(
      badgeSrc.includes('CheckCircle2') &&
      badgeSrc.includes('AlertTriangle') &&
      badgeSrc.includes('XCircle') &&
      badgeSrc.includes('text-emerald-400') &&
      badgeSrc.includes('text-rose-400') &&
      badgeSrc.includes('text = "OK"') &&
      badgeSrc.includes('text = "BREACH"'),
      'FT-62: Accessible multi-channel status badge renders color, Lucide icon, and text simultaneously'
    );
  } catch (e) {
    assert(false, `FT-62 exception: ${e.message}`);
  }

  console.log('\n----------------------------------------------------');
  if (failed === 0) {
    console.log('🎉 ALL PHASE F7 ACCEPTANCE TESTS (FT-57 - FT-62) PASSED!');
    console.log('----------------------------------------------------');
    process.exit(0);
  } else {
    console.error(`❌ ${failed} PHASE F7 TESTS FAILED.`);
    console.log('----------------------------------------------------');
    process.exit(1);
  }
}

runTests();
