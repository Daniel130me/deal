-- Human-readable refs were previously allocated by loading every matching row
-- into the API and finding the largest suffix in JavaScript. PostgreSQL
-- sequences make allocation O(1), concurrency-safe, and independent of table
-- growth while preserving the existing REQ-001 / BKG-001 / DEAL-001 format.

CREATE SEQUENCE "client_request_ref_seq";
CREATE SEQUENCE "booking_ref_seq";
CREATE SEQUENCE "deal_ref_seq";

SELECT setval(
  'client_request_ref_seq',
  COALESCE(MAX((regexp_match("ref", '([0-9]+)$'))[1]::bigint), 0) + 1,
  false
) FROM "ClientRequest";

SELECT setval(
  'booking_ref_seq',
  COALESCE(MAX((regexp_match("ref", '([0-9]+)$'))[1]::bigint), 0) + 1,
  false
) FROM "Booking";

SELECT setval(
  'deal_ref_seq',
  COALESCE(MAX((regexp_match("ref", '([0-9]+)$'))[1]::bigint), 0) + 1,
  false
) FROM "Deal";
