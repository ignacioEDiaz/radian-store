-- Up Migration
ALTER TABLE customers DROP CONSTRAINT customers_role_check;
ALTER TABLE customers ADD CONSTRAINT customers_role_check CHECK (role IN ('customer', 'admin', 'viewer'));

-- Down Migration
UPDATE customers SET role = 'customer' WHERE role = 'viewer';
ALTER TABLE customers DROP CONSTRAINT customers_role_check;
ALTER TABLE customers ADD CONSTRAINT customers_role_check CHECK (role IN ('customer', 'admin'));
