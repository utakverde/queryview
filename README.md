# SAMELCO II Reports API and Web Client

Run `start_all_servers.bat`, then open <http://127.0.0.1:3001>. This single server provides the API, Tables, Graphs, Cash Flow, and Collection Monitoring pages.

The separate graph dashboard is available at `/visual-report` and uses the cached four-database bill-history summary.

The collection calendar and supplier-payment planner are available as a separate report at `/cash-flow`.

The rate-component allocation and reconciliation report is available at `/collection-components`.

Collector and bank collection performance is available at `/collector-report`.

BAPA mother-meter versus individual-consumer loss analysis is available at `/loss-report`.

## Install On Another Windows PC

Run `BUILD_PORTABLE_PACKAGE.bat` on the source PC. It creates `outputs/SAMELCO-II-Reports-Portable.zip` with bundled Node.js and MySQL client executables. Private credentials and cached consumer report data are excluded.

On the destination PC:

1. Extract the ZIP to a permanent folder such as `C:\SAMELCO-II-Reports`.
2. Run `INSTALL.bat`.
3. Enter the live MySQL server IP, port, user, and password.
4. The installer verifies all four databases and creates Start, Stop, Open, and Configure shortcuts on the desktop.

No administrator access is required unless Windows Firewall must be opened for LAN clients. Use `CONFIGURE.bat` again whenever the database server, credentials, or any of the four database names change.

## API

- `GET /api/health` checks server availability.
- `GET /api/catalog` lists configured databases and all available reports.
- `GET /api/bill-months` returns every available Regular/BAPA bill month across all four databases using a 24-hour cache.
- `GET /api/collection-components?from=YYYY-MM-DD&to=YYYY-MM-DD&database=all&group=all` returns paid-bill component and allocation summaries for a 26th-to-25th cycle.
- `GET /api/collector-report?from=YYYY-MM-DD&to=YYYY-MM-DD` returns collector and normalized bank collection shares across all four databases.
- `GET /api/loss-report?database=all&billMonth=MMYY` compares BAPA mother-meter and individual-consumer kWh by area and book.
- `GET /api/reports/{report-id}?database=dbsamelco` returns a report with columns, totals, and rows.

Report IDs: `area-address`, `monthly-growth`, `collection`, `area-billing`, `consumer-history`, `combined-history`, `payment-insights`, and `billing-cycle-detail`.

Database access is read-only. Settings come from `consumer_growth_kwh_forecast/builder.config.json`.

Reports are cached for 30 minutes in `.report_cache` and then refreshed in the background. Add `refresh=1` to a report API request when an immediate database refresh is required.

## Portable Collection Monitoring

Collection Monitoring stores completed live-MySQL results and the bill-month catalog in `portable_data/reporting_cache.sqlite`. Repeated requests load from SQLite, stale snapshots display immediately while live data refreshes in the background, and saved filter combinations remain available if MySQL is temporarily unavailable. New filter combinations still require the configured live MySQL source.

## Running On Another Server

The application can run from another Windows server when Node.js 22+ and the MySQL command-line client are installed. Copy the project folder, copy `server_settings.example.bat` to `server_settings.bat`, and update the database connection values. The launcher reads this private settings file automatically.

- `REPORT_HOST=127.0.0.1` allows access only on the server itself.
- `REPORT_HOST=0.0.0.0` allows LAN clients to connect; permit the selected `PORT` in Windows Firewall.
- `MYSQL_HOST` must be the live MySQL server hostname or IP, not `localhost`, when MySQL is on a different computer.
- `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_EXE` override `builder.config.json`.
- `MYSQL_DATABASE_1` through `MYSQL_DATABASE_4` configure the MAIN, CATBALOGAN, BASEY, and VILLAREAL database/schema names without changing application source code.
- The MySQL account only needs read access to the four configured databases.

Portable SQLite is a cache, not a complete replacement for live MySQL. Previously generated filter combinations can load from `portable_data/reporting_cache.sqlite`; uncached filters and refreshes require the live database connection.

## Sync Remote Data To Local SQLite

After configuring `server_settings.bat`, run `sync_remote_data.bat`. It refreshes the bill-month catalog, all standard reports for all configured databases, and the latest completed Collection Components cycle. Every completed result is stored in `portable_data/reporting_cache.sqlite` for local/offline report loading.

To also save a specific Collection Monitoring selection:

```bat
sync_remote_data.bat 0826 2026-08-24 2026-09-02
```

Arguments are `BillMonth`, collection date from, and collection date to. Run the sync again whenever a fresh copy is needed. This copies aggregated report results, not raw consumer-level MySQL tables.

## Set Up From Git

Copy `consumer_growth_kwh_forecast/builder.config.example.json` to `consumer_growth_kwh_forecast/builder.config.json` before starting the server. Configure your database connection locally using `CONFIGURE.bat` or `server_settings.bat`. Private configuration files are excluded from Git.

For the workbook builder, copy `.workbook_build/builder.config.example.json` to `.workbook_build/builder.config.json`.

Consumer spreadsheets, SQLite databases, SQL exports, generated feeder data, and report outputs are excluded from this repository. Restore these separately from your private local data. To rebuild `generated/feeder-engineering.json`, place the feeder workbooks in `sales feeder/`, install `pandas` and `pyxlsb`, and run `python tools/build_feeder_dataset.py`. Build the portable Windows package after restoring this dataset.
