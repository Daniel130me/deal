/**
 * Webhook intake policy — named constants instead of magic values (todo.md C2).
 */

/** Flutterwave marks every delivery with its configured secret hash in this header. */
export const FLW_VERIF_HASH_HEADER = 'verif-hash';

/** The only Flutterwave event this pipeline acts on (it also carries failures). */
export const FLW_CHARGE_COMPLETED = 'charge.completed';

/** Paystack signs the raw body (HMAC-SHA512, secret key) into this header. */
export const PS_SIGNATURE_HEADER = 'x-paystack-signature';

/** The only Paystack event this pipeline acts on. */
export const PS_CHARGE_SUCCESS = 'charge.success';

/** The gateway-status string both rails use for "money actually moved". */
export const GATEWAY_SUCCESSFUL = 'successful';
