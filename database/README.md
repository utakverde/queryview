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
