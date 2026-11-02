/** Server-only provider adapter. No network calls, merchant accounts or real money. */
export class DemoPaymentProvider {
  constructor({ delayMs = 2000 } = {}) { this.delayMs = delayMs; }
  createAttempt({ now }) {
    return { status: 'pending', due: now + this.delayMs, outcome: 'confirmed' };
  }
  eventFor(attempt) {
    return { id: `sim-${attempt.id}`, attempt: attempt.id, status: attempt.outcome };
  }
}
