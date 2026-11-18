-- Explicit deny policy documents that users cannot access rate-limit records.
create policy query_usage_deny on headcount_private.query_usage for all to authenticated using(false) with check(false);
