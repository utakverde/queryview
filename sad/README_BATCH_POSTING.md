# Beneficiary batch posting

`beneficiaries.sqlite` is the local database for the April 2026 beneficiary list.

## Start

Double-click `START_BATCH_POSTING.bat`, then use <http://127.0.0.1:3002/>.

1. Filter or search the pending beneficiaries.
2. Select the records to post.
3. Enter the paid date and voucher/check/payment reference.
4. Click **Post selected to paid**.

Each posting is saved as one transaction in `payment_batches`. If any selected
record is already paid, the entire batch is rejected. `payment_audit` keeps the
record-level audit trail.

## Refresh from the Excel source

Run this from the `sad` folder:

```bat
"C:\Users\SAMELCO II\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" beneficiary_app.py import
```

Re-importing updates beneficiary details but preserves paid status and payment
references. The unique key is account number plus bill month.

## Scope

This tool records payment status in the local SQLite database. It does not write
to the live billing/accounting database. Export the current database view as CSV
from the web page if another system needs an upload file.
