# ECPay surcharge posting plan

Status: design only. Paid posting and billing tables have not been changed.

## Current system, checked 2026-10-15

- Billing server reports MySQL 5.5.8. All four offices' `billhistory`, `billhistory_bi`, and `billhistory_bm` tables use MyISAM. The current ECPay flow reads and updates only `billhistory`.
- `billhistory.Entry` is the primary key; `TotalBill` is `DOUBLE(21,2)`, `BillMonth` is `VARCHAR(4)`, `PresentReadingDate` is `DATE`, and payment state is stored in `flag_paid`, `date_paid`, `collector_code`, and `ORCollection`.
- The separate ECPay audit server reports MySQL 8.4.11 and already has `ecpay_audit.post_log_v3`. It records imported amount and result but has no fee assessment or bill-level payment allocation.
- The Unpaid Data export now calculates a 2% fee from the chosen surcharge month's unpaid bills that were due on or before the export date. The current paid importer requires the imported amount to equal the sum of unpaid `TotalBill`; a fee-bearing payment therefore fails the exact-match check.

## Recommended data model

Update **both** systems. In each MySQL 5.5 billing office, add dedicated surcharge tables alongside `billhistory` so the billing database knows the fee owed and paid. In MySQL 8.4, add the export, receipt, and reconciliation ledger. Keep `billhistory.TotalBill` as the original bill amount: existing reports sum it as billed energy charges, and the surcharge is an extra amount.

### MySQL 5.5 billing database: add in each office schema

| Table | Essential fields and constraints | Purpose |
| --- | --- | --- |
| `ecpay_surcharge` | `id` BIGINT primary key, `AccountNumber` VARCHAR(10), `BillMonth` VARCHAR(4), `BasisAmount` DECIMAL(15,2), `RateBps` SMALLINT UNSIGNED default 200, `SurchargeAmount` DECIMAL(15,2), `OriginalDueDate` DATE, `AssessedAt` DATETIME, `Status` VARCHAR(20), `PaidAt` DATETIME NULL, `ORCollection` VARCHAR(80) NULL, `AuditAssessmentId` BIGINT NULL, `Revision` INT UNSIGNED default 1, unique `(AccountNumber, BillMonth)` | One current surcharge balance per account and selected surcharge month. Use the exact office schema rather than an office string because each office has its own database. |
| `ecpay_surcharge_bill` | `SurchargeId` BIGINT, `BillEntry` BIGINT, `BillAmount` DECIMAL(15,2), `DueDate` DATE, primary key `(SurchargeId, BillEntry)`, index on `BillEntry` | Records each `billhistory.Entry` included in the 2% basis. Check references in application code: MyISAM does not enforce foreign keys. |
| `ecpay_surcharge_change` | `id` BIGINT primary key, `SurchargeId` BIGINT, `ChangedAt` DATETIME, `OldStatus` VARCHAR(20), `NewStatus` VARCHAR(20), `OldAmount` DECIMAL(15,2), `NewAmount` DECIMAL(15,2), `Reason` VARCHAR(255), `BatchId` VARCHAR(80) | Append-only history for fee changes, payment, reversal, and recovery. Do not silently overwrite an assessed amount. |

Use `ENGINE=InnoDB` for the new billing surcharge tables if that engine is enabled on the 5.5 server; verify with `SHOW ENGINES` before migration. This protects changes among the new tables, but it cannot make existing MyISAM `billhistory` updates atomic. Keep `DATETIME` without fractional seconds for compatibility with the observed billing server. `Status` should allow `quoted`, `paid`, `reversed`, and `needs_reconciliation`. The billing application should display the extra charge as `SUM(unpaid billhistory.TotalBill) + unpaid ecpay_surcharge.SurchargeAmount`, with the two components visible separately. If it needs a single view, add a read-only query/view instead of changing `TotalBill`.

Add an index on `billhistory (BillMonth, AccountNumber)` after checking existing indexes and the query plan. It supports identifying the selected month's source bills. Do not add fee columns to `billhistory`, `billhistory_bi`, or `billhistory_bm`: the fee is at **account plus bill month** grain, while those tables contain individual bill rows. A fee column on every row would invite duplicate charges.

Add these InnoDB tables to `ecpay_audit`:

| Table | Essential fields and constraints | Purpose |
| --- | --- | --- |
| `export_batch` | `id` BIGINT primary key, `created_at` DATETIME(3), `office_database` VARCHAR(128), `export_bill_month` CHAR(4), `surcharge_bill_month` CHAR(4) NULL, `surcharge_rate_bps` SMALLINT UNSIGNED (200), `as_of_date` DATE, `due_offset_days` SMALLINT UNSIGNED, `format` VARCHAR(10), `status` VARCHAR(20) | Freezes the export settings used to quote a balance. |
| `export_line` | `id` BIGINT primary key, `batch_id` foreign key, `office_database` VARCHAR(128), `account_number` VARCHAR(80), `base_unpaid_amount` DECIMAL(15,2), `surcharge_basis_amount` DECIMAL(15,2), `surcharge_amount` DECIMAL(15,2), `expected_payment_amount` DECIMAL(15,2), `original_due_date` DATE, `export_due_date` DATE, `source_fingerprint` CHAR(64), unique `(batch_id, office_database, account_number)` | Preserves exactly what ECPay received, including the fee and date before and after adjustment. |
| `export_line_bill` | `export_line_id` foreign key, `office_database` VARCHAR(128), `bill_entry` BIGINT, `bill_month` CHAR(4), `bill_amount` DECIMAL(15,2), `surcharge_basis` TINYINT(1), primary key `(export_line_id, office_database, bill_entry)` | Records which legacy bill rows made up the balance and which rows were used for the fee. |
| `surcharge_assessment` | `id` BIGINT primary key, `office_database` VARCHAR(128), `billing_surcharge_id` BIGINT, `account_number` VARCHAR(80), `surcharge_bill_month` CHAR(4), `basis_amount` DECIMAL(15,2), `rate_bps` SMALLINT UNSIGNED, `amount` DECIMAL(15,2), `assessed_at` DATETIME(3), `paid_at` DATETIME(3) NULL, `status` VARCHAR(20), `revision` INT UNSIGNED, `export_line_id` foreign key, unique `(office_database, billing_surcharge_id, revision)` | Auditable MySQL 8.4 copy of the billing assessment; revisions remain visible. |
| `payment_receipt` | `id` BIGINT primary key, `office_database` VARCHAR(128), `account_number` VARCHAR(80), `external_reference` VARCHAR(120), `source_file` VARCHAR(255), `source_row` INT, `amount_received` DECIMAL(15,2), `base_applied` DECIMAL(15,2), `surcharge_applied` DECIMAL(15,2), `date_paid` DATE, `or_collection` VARCHAR(80), `status` VARCHAR(20), `export_line_id` foreign key, `post_log_id` BIGINT NULL, unique idempotency key | Reconciles the ECPay remittance into bill and fee components and supports safe retries. |
| `payment_bill_allocation` | `receipt_id` foreign key, `office_database` VARCHAR(128), `bill_entry` BIGINT, `amount_applied` DECIMAL(15,2), primary key `(receipt_id, office_database, bill_entry)` | Shows which legacy bills the base portion paid. |

Use `DECIMAL(15,2)` for all new money fields. Convert the legacy `DOUBLE` values to cents once when creating the export quote. The current export rounds 2% after summing the selected month's eligible unpaid bills per account; retain that exact rule in the ledger. Store the rate as 200 basis points and calculate the fee as `ROUND(basis_amount * 200 / 10000, 2)`.

The MySQL 8.4 server cannot enforce a foreign key to the separate billing server. Store the office database name, billing surcharge ID, and `billhistory.Entry` references; verify them in application code and a reconciliation job.

## Billing-table changes

The proposed update to the **billing database** is the three `ecpay_surcharge*` tables in each office schema, plus the bill lookup index if needed. The proposed update to **MySQL 8.4** is the six InnoDB tables above. Billing `ecpay_surcharge` owns the current fee balance; MySQL 8.4 owns the export snapshot, remittance receipt, and audit history. Continue updating `billhistory.flag_paid`, `date_paid`, `collector_code`, and `ORCollection` for the base bill rows. Keep `billhistory_bi` and `billhistory_bm` outside ECPay scope unless that product scope changes.

## Posting sequence to implement later

1. At export, read eligible unpaid bill rows, calculate base amount and fee, and create or reuse the billing `ecpay_surcharge` row and its source-bill rows. Save the matching MySQL 8.4 `export_batch`, `export_line`, `export_line_bill`, and assessment before releasing the file. If the basis changes, increment the revision and record the previous values in `ecpay_surcharge_change`; never add the same 2% twice.
2. At import, identify a unique export line using office, account, bill month, and ECPay's transaction reference or another stable batch identifier. Match `amount_received` exactly to `base_unpaid_amount + surcharge_amount`. Reject ambiguous exports, changed bill balances, mismatched fees, and duplicate transaction references for review.
3. Re-read the legacy unpaid bill rows by `Entry` before posting. Verify bill amount, paid status, source row set, surcharge revision, and collector account. Apply the base amount to `billhistory` as today; set the matching billing `ecpay_surcharge` row to `paid`; save the fee as a separate paid assessment and receipt allocation on MySQL 8.4. Do not mark a fee as a paid energy bill.
4. Since MyISAM updates on the billing server cannot roll back with the InnoDB ledger on another server, use a durable posting state machine (`pending`, `billing_applied`, `complete`, `needs_reconciliation`) and an idempotency key. On every retry, inspect both servers and finish or flag the incomplete step. Do not infer success solely from the client response.
5. Reconcile daily: ECPay remittance total = base bill allocations + surcharge allocations; compare `payment_bill_allocation` to legacy paid rows, the 8.4 assessment to billing `ecpay_surcharge`, and `payment_receipt` to `post_log_v3`. Surface any incomplete or duplicate cases for manual review.

## Rollout gates

1. Confirm with Finance whether the fee belongs to the utility or ECPay, whether it is assessed at export or only when paid, how refunds and reversals work, and which date/time zone defines “due today.” These decisions determine accounting ownership and the assessment lifecycle.
2. Test the new tables and posting state machine against a copy of each office database. Include repeated exports, paid-after-export bills, partial payments, duplicate ECPay files, failed writes between the two servers, and a fee month different from the export bill month.
3. Deploy the ledger and read-only quote comparison first. Enable fee-bearing posting only after reconciliation reports show that the quote, remittance, legacy bill updates, and fee ledger agree.
4. Plan a separate, controlled migration of billing `billhistory` from MyISAM to InnoDB if true atomic bill posting is required. This needs compatibility testing and a maintenance window; moving the audit database to MySQL 8.4 alone does not make the legacy billing update transactional.

## MySQL references

- [MySQL 8.4 storage engines and InnoDB transaction support](https://dev.mysql.com/doc/refman/8.4/en/create-table.html)
- [MySQL 8.4 exact `DECIMAL` and approximate `DOUBLE` types](https://dev.mysql.com/doc/refman/8.4/en/data-types.html)
- [MySQL 8.4 `SELECT ... FOR UPDATE` locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)
- [MySQL 8.4 `ALTER TABLE` engine conversion](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html)
