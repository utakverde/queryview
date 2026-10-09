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
