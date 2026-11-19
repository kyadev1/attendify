-- READ ONLY: inspection, not a destructive permission test.
BEGIN TRANSACTION READ ONLY;
SELECT r.rolname AS role, c.oid::regclass AS relation, p.privilege,
       has_table_privilege(r.oid, c.oid, p.privilege) AS allowed,
       CASE WHEN has_table_privilege(r.oid, c.oid, p.privilege)
            THEN 'FAIL: excess effective privilege remains'
            ELSE 'PASS: privilege absent' END AS catalog_result
FROM pg_catalog.pg_roles r
CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public'
  AND c.relname IN ('events','profiles','registrations','attendance')
ORDER BY r.rolname,c.relname,p.privilege;
-- Expect 32 rows; all allowed=false. This does not test RLS or RPC behavior.
ROLLBACK;
