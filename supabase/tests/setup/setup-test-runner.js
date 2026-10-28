/**
 * FallTrack Mandatory First-Time System Setup Test Suite
 * 
 * Verifies validation rules, mobile number formats, rate precision,
 * setup-completion detection, user isolation, and income math.
 */

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
};

let passedCount = 0;
let failedCount = 0;

const runTest = (name, testFn) => {
  try {
    testFn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
  }
};

// -------------------------------------------------------------
// Validation Implementations (mirrored from settingsService)
// -------------------------------------------------------------

const normalizeIndianMobile = (raw) => {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/[\s\-()]/g, '')
    .replace(/^(\+91|0)/, '');
};

const isValidIndianMobile = (raw) => {
  const normalized = normalizeIndianMobile(raw);
  return /^[6-9]\d{9}$/.test(normalized);
};

const validateManagerName = (name) => {
  if (!name) return 'Manager name is required.';
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'Manager name must be at least 2 characters.';
  return null;
};

const validateRatePerDozen = (val) => {
  if (val === null || val === undefined || String(val).trim() === '') {
    return 'Rate per dozen is required.';
  }
  const num = parseFloat(String(val).trim());
  if (isNaN(num)) return 'Rate per dozen must be a valid number.';
  if (num <= 0) return 'Rate must be a positive amount greater than 0.';
  if (num > 10000) return 'Rate cannot exceed ₹10,000.00.';
  return null;
};

// Income calculation formula: 12 falls = 1 dozen
const calculateIncome = (totalFalls, ratePerDozen) => {
  const dozens = totalFalls / 12;
  return Number((dozens * ratePerDozen).toFixed(2));
};

// Setup status resolver logic
const resolveSetupStatus = (profileData, historicalEntriesCount = 0, ratesCount = 0) => {
  if (!profileData) {
    return false; // New registration with no profile
  }

  // Explicit database flag check
  if (typeof profileData.is_setup_completed === 'boolean') {
    return profileData.is_setup_completed;
  }

  // Backward compatibility check for legacy un-migrated accounts
  const hasCustomName = profileData.manager_name && 
    profileData.manager_name !== 'Manager' && 
    profileData.manager_name.trim() !== '';
  const hasExistingData = historicalEntriesCount > 0 || ratesCount > 0;

  return Boolean(hasCustomName || hasExistingData);
};

// -------------------------------------------------------------
// Test Execution
// -------------------------------------------------------------

console.log('\n======================================================');
console.log('FallTrack Mandatory System Setup - Test Suite');
console.log('======================================================\n');

// 1. Indian Mobile Number Validation
console.log('Group 1: Indian Mobile Number Format & Normalization');
runTest('Accepts standard 10-digit Indian numbers starting with 6, 7, 8, 9', () => {
  assert(isValidIndianMobile('9876543210'), 'Should accept 9876543210');
  assert(isValidIndianMobile('8765432109'), 'Should accept 8765432109');
  assert(isValidIndianMobile('7654321098'), 'Should accept 7654321098');
  assert(isValidIndianMobile('6543210987'), 'Should accept 6543210987');
});

runTest('Normalizes and accepts +91 prefix and formatting characters', () => {
  assert(isValidIndianMobile('+919876543210'), 'Should accept +919876543210');
  assert(isValidIndianMobile('+91 98765 43210'), 'Should accept +91 98765 43210');
  assert(isValidIndianMobile('09876543210'), 'Should accept leading zero 09876543210');
  assert(isValidIndianMobile('98765-43210'), 'Should accept dashes 98765-43210');
  assert(normalizeIndianMobile('+91 98765 43210') === '9876543210', 'Should normalize to 9876543210');
});

runTest('Rejects invalid mobile numbers', () => {
  assert(!isValidIndianMobile(''), 'Should reject empty string');
  assert(!isValidIndianMobile('5876543210'), 'Should reject starting with 5');
  assert(!isValidIndianMobile('1234567890'), 'Should reject starting with 1');
  assert(!isValidIndianMobile('987654321'), 'Should reject 9 digits');
  assert(!isValidIndianMobile('98765432100'), 'Should reject 11 digits');
  assert(!isValidIndianMobile('abcdefghij'), 'Should reject non-digits');
});

// 2. Manager Name Validation
console.log('\nGroup 2: Manager Name Validation');
runTest('Accepts valid non-empty manager names', () => {
  assert(validateManagerName('Sanket Shinde') === null, 'Should accept Sanket Shinde');
  assert(validateManagerName('Rajesh') === null, 'Should accept Rajesh');
  assert(validateManagerName('  Pooja Patil  ') === null, 'Should accept padded name');
});

runTest('Rejects empty or too-short manager names', () => {
  assert(validateManagerName('') !== null, 'Should reject empty string');
  assert(validateManagerName('   ') !== null, 'Should reject whitespace');
  assert(validateManagerName('A') !== null, 'Should reject single character');
});

// 3. Rate per Dozen Validation
console.log('\nGroup 3: Rate per Dozen Validation');
runTest('Accepts valid positive numeric rates', () => {
  assert(validateRatePerDozen('5.00') === null, 'Should accept 5.00');
  assert(validateRatePerDozen('6.50') === null, 'Should accept 6.50');
  assert(validateRatePerDozen('0.50') === null, 'Should accept 0.50');
  assert(validateRatePerDozen('12') === null, 'Should accept 12');
});

runTest('Rejects invalid, zero, or negative rates', () => {
  assert(validateRatePerDozen('') !== null, 'Should reject empty string');
  assert(validateRatePerDozen('0') !== null, 'Should reject 0');
  assert(validateRatePerDozen('-5.00') !== null, 'Should reject negative rate');
  assert(validateRatePerDozen('abc') !== null, 'Should reject text');
  assert(validateRatePerDozen('15000') !== null, 'Should reject excessive rates > 10,000');
});

// 4. Setup Completion Resolution & Detection
console.log('\nGroup 4: First-Login Detection & Backward Compatibility');
runTest('Identifies new user with no profile as incomplete', () => {
  const isComplete = resolveSetupStatus(null, 0, 0);
  assert(isComplete === false, 'New user without profile must require setup modal');
});

runTest('Identifies user with is_setup_completed = false as incomplete', () => {
  const profile = { user_id: 'new-u1', manager_name: 'Manager', is_setup_completed: false };
  const isComplete = resolveSetupStatus(profile, 0, 0);
  assert(isComplete === false, 'Explicit is_setup_completed = false must require setup modal');
});

runTest('Identifies user with is_setup_completed = true as completed', () => {
  const profile = { user_id: 'user-done', manager_name: 'Ramesh', is_setup_completed: true };
  const isComplete = resolveSetupStatus(profile, 0, 0);
  assert(isComplete === true, 'Explicit is_setup_completed = true must proceed to dashboard');
});

runTest('Backward compatibility: Existing user with historical entries treated as completed', () => {
  const legacyProfile = { user_id: 'legacy-u1', manager_name: 'Manager' }; // no boolean column yet
  const isComplete = resolveSetupStatus(legacyProfile, 15, 2); // 15 production entries
  assert(isComplete === true, 'Legacy user with entries must not be blocked');
});

runTest('Backward compatibility: Legacy user with customized name treated as completed', () => {
  const legacyProfile = { user_id: 'legacy-u2', manager_name: 'Sanket Patil' }; // non-default name
  const isComplete = resolveSetupStatus(legacyProfile, 0, 0);
  assert(isComplete === true, 'Legacy user with customized name must not be blocked');
});

// 5. Multi-User Isolation
console.log('\nGroup 5: Multi-Tenant Setup Isolation');
runTest('Configuring User A does not mark User B as completed', () => {
  const userAProfile = { user_id: 'user-a', manager_name: 'Owner A', is_setup_completed: true };
  const userBProfile = null; // Fresh account

  assert(resolveSetupStatus(userAProfile, 5, 1) === true, 'User A should be completed');
  assert(resolveSetupStatus(userBProfile, 0, 0) === false, 'User B must still require setup modal');
});

// 6. Income Math Verification with Initial Configured Rates
console.log('\nGroup 6: Financial Precision & Dozen Rule Preservation');
runTest('Calculates income accurately using (Falls / 12) * Rate per dozen', () => {
  // Test case 1: 48,000 falls at ₹5.00/dozen = ₹20,000.00
  const income1 = calculateIncome(48000, 5.00);
  assert(income1 === 20000.00, `Expected ₹20,000.00, got ₹${income1}`);

  // Test case 2: 12,000 falls at ₹6.50/dozen = ₹6,500.00
  const income2 = calculateIncome(12000, 6.50);
  assert(income2 === 6500.00, `Expected ₹6,500.00, got ₹${income2}`);

  // Test case 3: Fractional dozens (1,724 falls at ₹6.50)
  // 1724 / 12 = 143.6666... * 6.50 = 933.8333... -> 933.83
  const income3 = calculateIncome(1724, 6.50);
  assert(income3 === 933.83, `Expected ₹933.83, got ₹${income3}`);
});

console.log('\n------------------------------------------------------');
console.log(`Results: ${passedCount} passed, ${failedCount} failed.`);
console.log('------------------------------------------------------\n');

if (failedCount > 0) {
  process.exit(1);
}
