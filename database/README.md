# SAMELCO Reporting Database

`samelco_reporting_mysql55.sql` creates the `samelco_reporting` database and loads the current API reporting datasets. It is compatible with MySQL 5.5.

## Import

```powershell
Get-Content -Raw -LiteralPath '.\database\samelco_reporting_mysql55.sql' | mysql -h localhost -u root -p
```

The script replaces only reporting tables inside `samelco_reporting`. It does not modify `dbsamelco`, `dbsamelco_catbalogan`, `dbsamelco_basey`, or `dbsamelco_villareal`.

## Refresh the SQL file

After refreshing the API report cache, run:

```powershell
node .\database\export_reporting_database.mjs
```

## Tables

- `report_database`
- `area_address_summary`
- `monthly_growth_summary`
- `collection_summary`
- `area_billing_summary`
- `consumer_history_summary`
- `combined_history_summary`
- `payment_insight`
- `billing_cycle_detail`
- `supplier_payment_plan`

## Separate MySQL 8.4 Audit Schema

`ecpay_audit_mysql84.sql` creates all seven ECPay audit tables: `post_log`, `post_log_v2`, `post_log_v3`, `reset_state`, `query_builder_audit`, `query_builder_execution_audit`, and `query_builder_execution_detail`. It uses the same definitions as the API and copies missing v2 rows into v3. Existing tables and records are preserved; this script does not repair incompatible existing table definitions.

Run against the MySQL 8.4 server using an administrator account:

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p < database/ecpay_audit_mysql84.sql
```

The default database is `ecpay_audit`. If using a different audit database name, update the script before importing. Configure the app's separate ECPay audit connection to the actual 8.4 port and client executable (`mysql` on Linux). Billing and Membership connections continue to use their existing source servers. The MySQL 5.5 reporting export above remains separate.

## QueryView Mirror Schema for Billing MySQL 5.5.8

`queryview_mysql55.sql` creates the `queryview` database with MySQL 5.5.8-compatible tables for ECPay posting/query audit records and compromise agreements/payments. It uses `DATETIME` at whole-second precision and avoids foreign keys and MySQL 8-only upsert syntax. Run it with a MySQL account allowed to create the database and tables:

```bash
mysql -h 192.168.1.100 -P 3306 -u YOUR_USER -p < database/queryview_mysql55.sql
```

This script creates the schema and performs the local `post_log_v2` to `post_log_v3` compatibility copy. It does not transfer records from the separate MySQL 8.4 server; export/import those records separately if a data mirror is needed. Existing tables are left in place by `CREATE TABLE IF NOT EXISTS`.

## Compromise Agreement Tables for MySQL 5.5.8

`compromise_agreements_mysql55.sql` creates only the `compromise_agreement` and `compromise_payment` tables in the default `ecpay_audit` database. The table definitions use whole-second `DATETIME` columns and are compatible with MySQL 5.5.8+:

```bash
mysql -h YOUR_HOST -P 3306 -u YOUR_USER -p < database/compromise_agreements_mysql55.sql
```

This is a schema-only export. The current app connection and automatic schema setup still target MySQL 8.4 and use fractional-second timestamps, so importing this file alone does not make the app run against MySQL 5.5.
