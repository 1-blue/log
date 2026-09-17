-- Backend RPCs and triggers execute private validation helpers while using the
-- service_role connection. Keep the schema hidden from API roles but allow the
-- backend role to resolve those explicitly non-public helper functions.
grant usage on schema private to service_role;
