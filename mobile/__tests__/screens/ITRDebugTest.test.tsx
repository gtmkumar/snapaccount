/**
 * Placeholder file — created during ITRDashboardScreen mock debugging.
 * The real tests are in ITRDashboardScreen.test.tsx.
 *
 * Root cause documented: missing __esModule: true in jest.mock('../../src/lib/api', ...)
 * caused Babel's _interopRequireDefault to double-wrap the default export, resulting in
 * "_api.default.get is not a function" inside the component's queryFn.
 */

describe('ITRDebugTest placeholder', () => {
  it('is a no-op placeholder', () => {
    expect(true).toBe(true);
  });
});
