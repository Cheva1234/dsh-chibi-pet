/**
 * Host half of the pet bundle.
 *
 * The pet is a browser surface: every frame, every state transition and every
 * pointer interaction lives in `client.js`. The Host row exists so the bundle
 * has a Loader entry (and therefore a place in the Client boot graph); it owns
 * no service, no session data and no timers, and it deliberately stays inert so
 * the pet can never influence agent behaviour, tool policy or approvals.
 *
 * @returns {void}
 */
export function apply() {}
