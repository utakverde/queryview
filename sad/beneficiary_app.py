#!/usr/bin/env python3
"""Local beneficiary database and browser-based batch posting tool."""

from __future__ import annotations

import argparse
import csv
import html
import json
import sqlite3
import sys
import uuid
from contextlib import closing
from datetime import date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


APP_DIR = Path(__file__).resolve().parent
DEFAULT_DB = APP_DIR / "beneficiaries.sqlite"
DEFAULT_XLSX = APP_DIR / "List of Beneficiaries for Disbursement_April2026 (1).xlsx"
SOURCE_SHEETS = {
    "Main": (8, "MAIN-GRID"),
    "Zumarraga": (8, "OFF-GRID ZUMARRAGA"),
    "Cincorama_4ps": (8, "OFF-GRID CINCORAMA"),
    "Bagongon_4ps": (8, "OFF-GRID BAGONGON"),
}


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS beneficiaries (
    id INTEGER PRIMARY KEY,
    account_number TEXT NOT NULL,
    bill_month TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    rate_code TEXT,
    kilowatt_hour REAL NOT NULL DEFAULT 0,
    lifeline_discount REAL NOT NULL DEFAULT 0,
    sc_discount REAL NOT NULL DEFAULT 0,
    sc_subsidy REAL NOT NULL DEFAULT 0,
    net_discount REAL NOT NULL DEFAULT 0,
    grid_area TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid')),
    paid_at TEXT,
    payment_reference TEXT,
    paid_batch_id TEXT,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(account_number, bill_month)
);
CREATE INDEX IF NOT EXISTS idx_beneficiary_status
    ON beneficiaries(payment_status, bill_month, grid_area);
CREATE INDEX IF NOT EXISTS idx_beneficiary_name
    ON beneficiaries(name);

CREATE TABLE IF NOT EXISTS payment_batches (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL,
    paid_at TEXT NOT NULL,
    notes TEXT,
    item_count INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_audit (
    id INTEGER PRIMARY KEY,
    beneficiary_id INTEGER NOT NULL REFERENCES beneficiaries(id),
    batch_id TEXT NOT NULL REFERENCES payment_batches(id),
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    changed_at TEXT NOT NULL
);
"""


def now_text() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def connect(db_path: Path = DEFAULT_DB) -> sqlite3.Connection:
    con = sqlite3.connect(db_path, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.executescript(SCHEMA)
    return con


def clean_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def clean_number(value) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def import_workbook(xlsx_path: Path, db_path: Path = DEFAULT_DB) -> dict:
    try:
        import openpyxl
    except ImportError as exc:
        raise RuntimeError("openpyxl is required to import the workbook") from exc

    workbook = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    imported = updated = skipped = 0
    stamp = now_text()
    with closing(connect(db_path)) as con, con:
        for sheet_name, (start_row, grid_area) in SOURCE_SHEETS.items():
            sheet = workbook[sheet_name]
            for source_row, row in enumerate(
                sheet.iter_rows(min_row=start_row, values_only=True), start=start_row
            ):
                account = clean_text(row[1] if len(row) > 1 else None)
                bill_month = clean_text(row[5] if len(row) > 5 else None).zfill(4)
                if not account or not bill_month or not bill_month.isdigit():
                    skipped += 1
                    continue
                name = clean_text(row[2] if len(row) > 2 else None)
                address = clean_text(row[3] if len(row) > 3 else None)
                rate_code = clean_text(row[4] if len(row) > 4 else None)
                kwh = clean_number(row[6] if len(row) > 6 else None)
                lifeline = clean_number(row[7] if len(row) > 7 else None)
                if sheet_name == "Main":
                    sc_discount = clean_number(row[8] if len(row) > 8 else None)
                    sc_subsidy = clean_number(row[9] if len(row) > 9 else None)
                else:
                    sc_discount = 0.0
                    sc_subsidy = clean_number(row[8] if len(row) > 8 else None)
                net = lifeline + sc_discount + sc_subsidy
                existing = con.execute(
                    "SELECT id FROM beneficiaries WHERE account_number=? AND bill_month=?",
                    (account, bill_month),
                ).fetchone()
                con.execute(
                    """
                    INSERT INTO beneficiaries (
                        account_number,bill_month,name,address,rate_code,kilowatt_hour,
                        lifeline_discount,sc_discount,sc_subsidy,net_discount,grid_area,
                        source_sheet,source_row,imported_at,updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(account_number,bill_month) DO UPDATE SET
                        name=excluded.name,address=excluded.address,rate_code=excluded.rate_code,
                        kilowatt_hour=excluded.kilowatt_hour,
                        lifeline_discount=excluded.lifeline_discount,
                        sc_discount=excluded.sc_discount,sc_subsidy=excluded.sc_subsidy,
                        net_discount=excluded.net_discount,grid_area=excluded.grid_area,
                        source_sheet=excluded.source_sheet,source_row=excluded.source_row,
                        updated_at=excluded.updated_at
                    """,
                    (
                        account, bill_month, name, address, rate_code, kwh, lifeline,
                        sc_discount, sc_subsidy, net, grid_area, sheet_name, source_row,
                        stamp, stamp,
                    ),
                )
                if existing:
                    updated += 1
                else:
                    imported += 1
    workbook.close()
    return {"imported": imported, "updated": updated, "skipped": skipped}


def post_paid(
    con: sqlite3.Connection,
    ids: list[int],
    reference: str,
    paid_at: str,
    notes: str = "",
) -> dict:
    ids = sorted(set(int(item) for item in ids))
    if not ids:
        raise ValueError("Select at least one beneficiary.")
    reference = reference.strip()
    if not reference:
        raise ValueError("Payment reference is required.")
    try:
        date.fromisoformat(paid_at)
    except ValueError as exc:
        raise ValueError("Paid date must be YYYY-MM-DD.") from exc

    marks = ",".join("?" for _ in ids)
    rows = con.execute(
        f"SELECT id, payment_status, net_discount FROM beneficiaries WHERE id IN ({marks})",
        ids,
    ).fetchall()
    found = {row["id"] for row in rows}
    missing = set(ids) - found
    if missing:
        raise ValueError(f"Unknown beneficiary IDs: {sorted(missing)}")
    already_paid = [row["id"] for row in rows if row["payment_status"] == "paid"]
    if already_paid:
        raise ValueError(f"Already paid; batch cancelled: {already_paid[:10]}")

    batch_id = f"PAY-{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6].upper()}"
    stamp = now_text()
    total = round(sum(abs(row["net_discount"]) for row in rows), 4)
    with con:
        con.execute(
            "INSERT INTO payment_batches VALUES (?,?,?,?,?,?,?)",
            (batch_id, reference, paid_at, notes.strip(), len(rows), total, stamp),
        )
        con.executemany(
            """UPDATE beneficiaries SET payment_status='paid', paid_at=?,
               payment_reference=?, paid_batch_id=?, updated_at=? WHERE id=?""",
            [(paid_at, reference, batch_id, stamp, row["id"]) for row in rows],
        )
        con.executemany(
            """INSERT INTO payment_audit
               (beneficiary_id,batch_id,old_status,new_status,changed_at)
               VALUES (?,?,'pending','paid',?)""",
            [(row["id"], batch_id, stamp) for row in rows],
        )
    return {"batch_id": batch_id, "count": len(rows), "total_amount": total}


def query_rows(con: sqlite3.Connection, params: dict) -> list[sqlite3.Row]:
    status = params.get("status", ["pending"])[0]
    bill_month = params.get("bill_month", [""])[0].strip()
    area = params.get("area", [""])[0].strip()
    search = params.get("search", [""])[0].strip()
    where, values = [], []
    if status in {"pending", "paid"}:
        where.append("payment_status=?")
        values.append(status)
    if bill_month:
        where.append("bill_month=?")
        values.append(bill_month)
    if area:
        where.append("grid_area=?")
        values.append(area)
    if search:
        where.append("(account_number LIKE ? OR name LIKE ? OR address LIKE ?)")
        token = f"%{search}%"
        values.extend([token, token, token])
    clause = " WHERE " + " AND ".join(where) if where else ""
    return con.execute(
        "SELECT * FROM beneficiaries" + clause + " ORDER BY grid_area,name LIMIT 1000",
        values,
    ).fetchall()


STYLE = """
body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f4f6f8;color:#17202a}
header{background:#123b63;color:white;padding:18px 26px}h1{margin:0;font-size:24px}
main{padding:20px 26px}.card{background:white;border-radius:8px;padding:16px;margin-bottom:16px;box-shadow:0 1px 4px #ccd}
.filters,.post{display:flex;gap:10px;align-items:end;flex-wrap:wrap}label{display:flex;flex-direction:column;font-size:12px;font-weight:600;gap:4px}
input,select,button,textarea{font:inherit;padding:7px 9px;border:1px solid #aeb8c2;border-radius:5px}button{background:#1261a0;color:#fff;border:0;cursor:pointer}.danger{background:#a02921}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #dde3e8;padding:7px;text-align:left}th{background:#edf3f8;position:sticky;top:0}.num{text-align:right}.muted{color:#65727e}.paid{color:#18713b;font-weight:700}.pending{color:#9a5b00;font-weight:700}.scroll{max-height:58vh;overflow:auto}.flash{background:#e4f4e8;border-left:4px solid #268443;padding:10px;margin-bottom:12px}.error{background:#fde8e7;border-left-color:#b52820}
"""


def page(con: sqlite3.Connection, params: dict, flash: str = "", is_error=False) -> str:
    rows = query_rows(con, params)
    summary = con.execute(
        """SELECT payment_status,COUNT(*) n,SUM(ABS(net_discount)) total
           FROM beneficiaries GROUP BY payment_status"""
    ).fetchall()
    stats = {r["payment_status"]: r for r in summary}
    areas = [r[0] for r in con.execute("SELECT DISTINCT grid_area FROM beneficiaries ORDER BY 1")]
    months = [r[0] for r in con.execute("SELECT DISTINCT bill_month FROM beneficiaries ORDER BY 1")]
    status = params.get("status", ["pending"])[0]
    search = params.get("search", [""])[0]
    area = params.get("area", [""])[0]
    month = params.get("bill_month", [""])[0]
    def opts(values, selected, all_label):
        out = [f'<option value="">{html.escape(all_label)}</option>']
        for value in values:
            sel = " selected" if value == selected else ""
            out.append(f'<option{sel}>{html.escape(value)}</option>')
        return "".join(out)
    body_rows = []
    for row in rows:
        checked = "" if row["payment_status"] == "pending" else " disabled"
        body_rows.append(
            f'<tr><td><input type="checkbox" name="ids" value="{row["id"]}"{checked}></td>'
            f'<td>{html.escape(row["account_number"])}</td><td>{html.escape(row["name"])}</td>'
            f'<td>{html.escape(row["address"])}</td><td>{html.escape(row["grid_area"])}</td>'
            f'<td>{row["bill_month"]}</td><td class="num">{row["kilowatt_hour"]:,.0f}</td>'
            f'<td class="num">{abs(row["net_discount"]):,.2f}</td>'
            f'<td class="{row["payment_status"]}">{row["payment_status"].upper()}</td>'
            f'<td>{html.escape(row["payment_reference"] or "")}</td></tr>'
        )
    pending = stats.get("pending")
    paid = stats.get("paid")
    flash_html = f'<div class="flash {"error" if is_error else ""}">{html.escape(flash)}</div>' if flash else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Beneficiary Batch Posting</title><style>{STYLE}</style></head>
<body><header><h1>Beneficiary Batch Posting</h1><div>Local SQLite database</div></header><main>{flash_html}
<div class="card"><b>Pending:</b> {pending['n'] if pending else 0:,} &nbsp; | &nbsp; <b>Paid:</b> {paid['n'] if paid else 0:,} &nbsp; | &nbsp; <b>Pending amount:</b> {pending['total'] if pending else 0:,.2f}</div>
<div class="card"><form class="filters" method="get"><label>Status<select name="status">{opts(['pending','paid','all'],status,'All')}</select></label><label>Bill month<select name="bill_month">{opts(months,month,'All months')}</select></label><label>Area<select name="area">{opts(areas,area,'All areas')}</select></label><label>Search<input name="search" value="{html.escape(search)}" placeholder="Account, name, address"></label><button>Filter</button><a href="/export.csv">Export CSV</a></form></div>
<form method="post" action="/post-paid"><div class="card post"><label>Paid date<input type="date" name="paid_at" value="{date.today().isoformat()}" required></label><label>Payment reference<input name="reference" required placeholder="Voucher/check/reference"></label><label>Notes<input name="notes" placeholder="Optional"></label><button class="danger" onclick="return confirm('Mark all selected records as PAID?')">Post selected to paid</button><span class="muted">A batch is all-or-nothing. Already-paid records are blocked.</span></div>
<div class="card scroll"><table><thead><tr><th><input type="checkbox" onclick="document.querySelectorAll('[name=ids]:not(:disabled)').forEach(x=>x.checked=this.checked)"></th><th>Account</th><th>Name</th><th>Address</th><th>Area</th><th>Bill month</th><th>kWh</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>{''.join(body_rows)}</tbody></table></div></form>
<p class="muted">Showing up to 1,000 filtered records. The Amount column is the absolute value of Lifeline Discount + SC Discount + SC Subsidy.</p></main></body></html>"""


class Handler(BaseHTTPRequestHandler):
    db_path = DEFAULT_DB

    def send_bytes(self, payload: bytes, content_type: str, status=HTTPStatus.OK):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            with closing(connect(self.db_path)) as con:
                data = page(con, parse_qs(parsed.query)).encode("utf-8")
            self.send_bytes(data, "text/html; charset=utf-8")
            return
        if parsed.path == "/export.csv":
            with closing(connect(self.db_path)) as con:
                rows = con.execute("SELECT * FROM beneficiaries ORDER BY grid_area,name").fetchall()
            import io
            output = io.StringIO(newline="")
            writer = csv.writer(output)
            writer.writerow(rows[0].keys() if rows else [])
            writer.writerows([tuple(row) for row in rows])
            self.send_bytes(output.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if urlparse(self.path).path != "/post-paid":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        length = int(self.headers.get("Content-Length", "0"))
        form = parse_qs(self.rfile.read(length).decode("utf-8"))
        try:
            ids = [int(value) for value in form.get("ids", [])]
            with closing(connect(self.db_path)) as con:
                result = post_paid(
                    con, ids, form.get("reference", [""])[0],
                    form.get("paid_at", [""])[0], form.get("notes", [""])[0],
                )
                message = f"Posted {result['count']} records. Batch {result['batch_id']}; amount {result['total_amount']:,.2f}."
                data = page(con, {"status": ["pending"]}, message).encode("utf-8")
            self.send_bytes(data, "text/html; charset=utf-8")
        except (ValueError, sqlite3.Error) as exc:
            with closing(connect(self.db_path)) as con:
                data = page(con, {"status": ["pending"]}, str(exc), True).encode("utf-8")
            self.send_bytes(data, "text/html; charset=utf-8", HTTPStatus.BAD_REQUEST)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    sub = parser.add_subparsers(dest="command", required=True)
    load = sub.add_parser("import", help="Import or refresh the Excel list")
    load.add_argument("xlsx", type=Path, nargs="?", default=DEFAULT_XLSX)
    serve = sub.add_parser("serve", help="Start the local batch-posting web app")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=3002)
    args = parser.parse_args()
    if args.command == "import":
        result = import_workbook(args.xlsx.resolve(), args.db.resolve())
        print(json.dumps(result, indent=2))
        return 0
    Handler.db_path = args.db.resolve()
    with closing(connect(Handler.db_path)):
        pass
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Beneficiary Batch Posting: http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
