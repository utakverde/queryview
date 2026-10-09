import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheDir = path.join(root, ".report_cache");
const outputPath = path.join(root, "database", "samelco_reporting_mysql55.sql");
const files = (await fs.readdir(cacheDir)).filter((name) => name.endsWith(".json"));
const datasets = await Promise.all(files.map(async (name) => JSON.parse(await fs.readFile(path.join(cacheDir, name), "utf8"))));

const q = (value) => value === null || value === undefined ? "NULL" : `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const n = (value) => value === null || value === undefined || Number.isNaN(Number(value)) ? "NULL" : String(Number(value));
const reportRows = (reportId) => datasets.filter((item) => item.report?.id === reportId).flatMap((item) => item.rows.map((row) => ({ sourceDatabase: item.database, sourceLabel: item.label, ...row })));

const sections = [];
function insert(table, columns, rows, mapper) {
  if (!rows.length) return;
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250).map((row) => `(${mapper(row).join(",")})`).join(",\n");
    sections.push(`INSERT INTO ${table} (${columns.join(",")}) VALUES\n${batch};`);
  }
}

sections.push(`-- SAMELCO II API reporting database
-- Generated from validated API cache data on ${new Date().toISOString()}.
-- Compatible with MySQL 5.5: no CTEs, JSON columns, window functions, or utf8mb4.
SET NAMES utf8;
SET FOREIGN_KEY_CHECKS=0;
CREATE DATABASE IF NOT EXISTS samelco_reporting CHARACTER SET utf8 COLLATE utf8_general_ci;
USE samelco_reporting;

DROP TABLE IF EXISTS supplier_payment_plan;
DROP TABLE IF EXISTS billing_cycle_detail;
DROP TABLE IF EXISTS payment_insight;
DROP TABLE IF EXISTS combined_history_summary;
DROP TABLE IF EXISTS consumer_history_summary;
DROP TABLE IF EXISTS area_billing_summary;
DROP TABLE IF EXISTS collection_summary;
DROP TABLE IF EXISTS monthly_growth_summary;
DROP TABLE IF EXISTS area_address_summary;
DROP TABLE IF EXISTS report_database;

CREATE TABLE report_database (
  database_code VARCHAR(64) NOT NULL,
  database_label VARCHAR(40) NOT NULL,
  PRIMARY KEY (database_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE area_address_summary (
  database_code VARCHAR(64) NOT NULL, area_code VARCHAR(20) NOT NULL,
  consumers BIGINT NOT NULL, with_address BIGINT NOT NULL, distinct_addresses BIGINT NOT NULL,
  coverage DECIMAL(14,10) NOT NULL, database_share DECIMAL(14,10) NOT NULL,
  PRIMARY KEY (database_code,area_code), KEY idx_area (area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE monthly_growth_summary (
  database_code VARCHAR(64) NOT NULL, bill_month CHAR(4) NOT NULL,
  consumers BIGINT NOT NULL, kwh DECIMAL(22,2) NOT NULL, total_bill DECIMAL(22,2) NOT NULL,
  consumer_growth DECIMAL(16,10) NULL, kwh_growth DECIMAL(16,10) NULL, bill_growth DECIMAL(16,10) NULL,
  PRIMARY KEY (database_code,bill_month), KEY idx_month (bill_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE collection_summary (
  database_code VARCHAR(64) NOT NULL, bill_month CHAR(4) NOT NULL, rate_code VARCHAR(10) NOT NULL,
  consumers BIGINT NOT NULL, kwh DECIMAL(22,2) NOT NULL, total_bill DECIMAL(22,2) NOT NULL,
  paid_consumers BIGINT NOT NULL, paid_kwh DECIMAL(22,2) NOT NULL, paid_bill DECIMAL(22,2) NOT NULL,
  unpaid_consumers BIGINT NOT NULL, unpaid_kwh DECIMAL(22,2) NOT NULL, unpaid_bill DECIMAL(22,2) NOT NULL,
  collection_rate DECIMAL(14,10) NOT NULL,
  PRIMARY KEY (database_code,bill_month,rate_code), KEY idx_collection_month (bill_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE area_billing_summary (
  database_code VARCHAR(64) NOT NULL, bill_month CHAR(4) NOT NULL, area_code VARCHAR(20) NOT NULL,
  consumers BIGINT NOT NULL, kwh DECIMAL(22,2) NOT NULL, total_bill DECIMAL(22,2) NOT NULL,
  paid_bill DECIMAL(22,2) NOT NULL, unpaid_bill DECIMAL(22,2) NOT NULL, collection_rate DECIMAL(14,10) NOT NULL,
  PRIMARY KEY (database_code,bill_month,area_code), KEY idx_area_bill_month (bill_month), KEY idx_area_bill_area (area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE consumer_history_summary (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, database_code VARCHAR(64) NOT NULL,
  bill_month CHAR(4) NOT NULL, area_code VARCHAR(20) NOT NULL, book_code VARCHAR(20) NOT NULL, address VARCHAR(255) NOT NULL,
  consumers BIGINT NOT NULL, kwh DECIMAL(22,2) NOT NULL, total_bill DECIMAL(22,2) NOT NULL,
  PRIMARY KEY (id), KEY idx_consumer_lookup (database_code,bill_month,area_code,book_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE combined_history_summary (
  database_label VARCHAR(40) NOT NULL, source_table VARCHAR(30) NOT NULL, bill_month CHAR(4) NOT NULL,
  consumers BIGINT NOT NULL, kwh DECIMAL(22,2) NOT NULL, total_bill DECIMAL(22,2) NOT NULL,
  PRIMARY KEY (database_label,source_table,bill_month), KEY idx_combined_month (bill_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE payment_insight (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, database_label VARCHAR(40) NOT NULL, source_table VARCHAR(30) NOT NULL,
  bill_month CHAR(4) NOT NULL, rate_code VARCHAR(10) NOT NULL, payment_date DATE NOT NULL,
  paid_count BIGINT NOT NULL, payment_amount DECIMAL(22,2) NOT NULL,
  PRIMARY KEY (id), KEY idx_payment_date (payment_date), KEY idx_payment_bill (bill_month), KEY idx_payment_rate (rate_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE billing_cycle_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, database_label VARCHAR(40) NOT NULL, source_table VARCHAR(30) NOT NULL,
  bill_month CHAR(4) NOT NULL, area_code VARCHAR(20) NOT NULL, book_code VARCHAR(20) NOT NULL,
  total_count BIGINT NOT NULL, total_amount DECIMAL(22,2) NOT NULL,
  due_count BIGINT NOT NULL, due_amount DECIMAL(22,2) NOT NULL,
  late_count BIGINT NOT NULL, late_amount DECIMAL(22,2) NOT NULL,
  unpaid_count BIGINT NOT NULL, unpaid_amount DECIMAL(22,2) NOT NULL,
  PRIMARY KEY (id), KEY idx_cycle_lookup (bill_month,database_label,source_table,area_code,book_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE supplier_payment_plan (
  collection_month CHAR(7) NOT NULL, payment_day TINYINT UNSIGNED NOT NULL, planned_amount DECIMAL(22,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_month,payment_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);

const databaseMap = new Map(datasets.filter((item) => item.database !== "all").map((item) => [item.database, item.label]));
insert("report_database", ["database_code","database_label"], [...databaseMap], ([code,label]) => [q(code),q(label)]);
insert("area_address_summary", ["database_code","area_code","consumers","with_address","distinct_addresses","coverage","database_share"], reportRows("area-address"), (r) => [q(r.sourceDatabase),q(r.area),n(r.consumers),n(r.withAddress),n(r.distinctAddresses),n(r.coverage),n(r.share)]);
insert("monthly_growth_summary", ["database_code","bill_month","consumers","kwh","total_bill","consumer_growth","kwh_growth","bill_growth"], reportRows("monthly-growth"), (r) => [q(r.sourceDatabase),q(r.month),n(r.consumers ?? 0),n(r.kwh ?? 0),n(r.totalBill ?? 0),n(r.consumerGrowth),n(r.kwhGrowth),n(r.billGrowth)]);
insert("collection_summary", ["database_code","bill_month","rate_code","consumers","kwh","total_bill","paid_consumers","paid_kwh","paid_bill","unpaid_consumers","unpaid_kwh","unpaid_bill","collection_rate"], reportRows("collection"), (r) => [q(r.sourceDatabase),q(r.month),q(r.rateCode),n(r.consumers),n(r.kwh),n(r.totalBill),n(r.paidConsumers),n(r.paidKwh),n(r.paidBill),n(r.unpaidConsumers),n(r.unpaidKwh),n(r.unpaidBill),n(r.collectionRate)]);
insert("area_billing_summary", ["database_code","bill_month","area_code","consumers","kwh","total_bill","paid_bill","unpaid_bill","collection_rate"], reportRows("area-billing"), (r) => [q(r.sourceDatabase),q(r.month),q(r.area),n(r.consumers),n(r.kwh),n(r.totalBill),n(r.paidBill),n(r.unpaidBill),n(r.collectionRate)]);
insert("consumer_history_summary", ["database_code","bill_month","area_code","book_code","address","consumers","kwh","total_bill"], reportRows("consumer-history"), (r) => [q(r.sourceDatabase),q(r.month),q(r.area),q(r.book),q(r.address),n(r.consumers),n(r.kwh),n(r.totalBill)]);
insert("combined_history_summary", ["database_label","source_table","bill_month","consumers","kwh","total_bill"], reportRows("combined-history"), (r) => [q(r.database),q(r.table),q(r.month),n(r.consumers),n(r.kwh),n(r.totalBill)]);
insert("payment_insight", ["database_label","source_table","bill_month","rate_code","payment_date","paid_count","payment_amount"], reportRows("payment-insights"), (r) => [q(r.database),q(r.table),q(r.billMonth),q(r.rateCode),q(r.paymentDate),n(r.paidCount),n(r.paymentAmount)]);
insert("billing_cycle_detail", ["database_label","source_table","bill_month","area_code","book_code","total_count","total_amount","due_count","due_amount","late_count","late_amount","unpaid_count","unpaid_amount"], reportRows("billing-cycle-detail"), (r) => [q(r.database),q(r.table),q(r.billMonth),q(r.area),q(r.book),n(r.totalCount),n(r.totalAmount),n(r.dueCount),n(r.dueAmount),n(r.lateCount),n(r.lateAmount),n(r.unpaidCount),n(r.unpaidAmount)]);
sections.push("SET FOREIGN_KEY_CHECKS=1;");

await fs.writeFile(outputPath, `${sections.join("\n\n")}\n`, "utf8");
console.log(outputPath);
