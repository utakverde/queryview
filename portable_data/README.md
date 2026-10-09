# Portable SQLite Data

`reporting_cache.sqlite` is created automatically when the reports server starts and data is loaded.

Collection Monitoring uses MySQL as the source of truth and stores completed filter results in this SQLite file. A previously loaded BillMonth and date-range combination can load from SQLite after restart and while the live MySQL source is temporarily unavailable. A filter combination that has never been loaded still requires the configured MySQL server.

For a portable copy, keep the entire project folder together, including this directory. The receiving computer needs the bundled or system Node.js runtime. Live synchronization additionally requires the MySQL command-line client and valid connection settings in `consumer_growth_kwh_forecast/builder.config.json`.

The SQLite file contains reporting summaries, not the full raw billing tables.
