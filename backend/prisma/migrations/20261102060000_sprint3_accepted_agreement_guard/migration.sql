-- A request has one commercial agreement in V1; post-acceptance amendments
-- are deferred. Fail migration on conflicting history rather than rewriting it.
CREATE UNIQUE INDEX "quotes_one_accepted_per_request"
ON "quotes" ("tenant_id", "request_id") WHERE "status" = 'ACCEPTED';
