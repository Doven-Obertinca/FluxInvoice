-- Provision flux_billing credentials separately; use BILLING_DATABASE_URL.
-- The normal flux_runtime role must not mutate paid entitlements.
GRANT USAGE ON SCHEMA public TO flux_billing;
GRANT SELECT(id) ON organizations TO flux_billing;
GRANT SELECT(id, email) ON users TO flux_billing;
GRANT SELECT ON organization_members TO flux_billing;
-- PostgreSQL FOR UPDATE requires an update privilege. No company fields granted.
GRANT UPDATE(id) ON organizations TO flux_billing;
GRANT SELECT, INSERT, UPDATE ON organization_subscriptions, billing_checkouts TO flux_billing;
GRANT SELECT, INSERT ON billing_events TO flux_billing;
REVOKE DELETE, TRUNCATE ON organization_subscriptions, billing_checkouts, billing_events FROM flux_billing;
