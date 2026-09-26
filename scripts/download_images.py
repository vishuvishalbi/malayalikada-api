#!/usr/bin/env python3
"""Download product images listed in a CSV and optionally upload them to products via the API.

CSV: any file with a URL column (auto-detects "Image Src", "image_url", "url", "image")
and an optional product key column (auto-detects "Variant Barcode", "barcode").
Shopify exports (multiple image rows per Handle) are supported: the barcode is
forward-filled across rows sharing the same Handle.

Examples:
  python3 scripts/download_images.py products.csv
  python3 scripts/download_images.py products.csv --out images --concurrency 8
  python3 scripts/download_images.py products.csv --upload --identifier admin@x.com --password secret
  API_TOKEN=<jwt> python3 scripts/download_images.py products.csv --upload --api-base http://localhost:3002/api/v1
"""
from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import os
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

DEFAULT_API = "https://lightblue-finch-568467.hostingersite.com/api/v1"
URL_COLS = ("Image Src", "image_src", "image_url", "imageUrl", "url", "image")
KEY_COLS = ("Variant Barcodes", "Variant Barcode", "barcode", "Barcode")
SKU_COLS = ("Variant SKU", "sku", "SKU")
HANDLE_COLS = ("Handle", "handle")
MAX_IMAGES = 5
UA = "malayalikada-image-downloader/1.0"


@dataclass
class Row:
    line: int
    url: str
    key: Optional[str]                      # primary key (barcode) used for folder naming
    lookup: list[str] = field(default_factory=list)  # barcode, sku, handle candidates for API lookup


@dataclass
class Result:
    row: Row
    path: Optional[Path] = None
    uploaded: bool = False
    skipped: Optional[str] = None
    error: Optional[str] = None


# ---------- CSV ----------

def pick_col(headers: list[str], candidates: tuple[str, ...], override: Optional[str]) -> Optional[str]:
    if override:
        if override not in headers:
            sys.exit(f"Column '{override}' not in CSV. Available: {headers}")
        return override
    lower = {h.lower(): h for h in headers}
    for c in candidates:
        if c.lower() in lower:
            return lower[c.lower()]
    return None


def read_rows(path: Path, url_col: Optional[str], key_col: Optional[str]) -> list[Row]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        ucol = pick_col(headers, URL_COLS, url_col)
        if not ucol:
            sys.exit(f"No URL column found. Use --url-col. Available: {headers}")
        kcol = pick_col(headers, KEY_COLS, key_col)
        scol = pick_col(headers, SKU_COLS, None)
        hcol = pick_col(headers, HANDLE_COLS, None)

        rows: list[Row] = []
        last_handle, last_keys = None, []
        for i, rec in enumerate(reader, start=2):
            url = (rec.get(ucol) or "").strip()
            handle = (rec.get(hcol) or "").strip() if hcol else ""
            keys = [(rec.get(c) or "").strip() for c in (kcol, scol) if c]
            keys = [k for k in keys if k]
            if not keys and handle and handle == last_handle:
                keys = last_keys  # Shopify: extra image rows carry only the Handle
            if keys:
                last_handle, last_keys = handle, keys
            elif handle:
                last_handle, last_keys = handle, []
            lookup = keys + ([handle] if handle else [])
            if url.startswith(("http://", "https://")):
                rows.append(Row(i, url, (keys or [handle] or [None])[0], lookup))
    return rows


# ---------- Download ----------

def safe_name(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_") or "file"


def target_path(out: Path, row: Row, seq: int) -> Path:
    base = os.path.basename(urlparse(row.url).path) or f"image_{seq}"
    base = safe_name(base.split("?")[0])
    if row.key:
        return out / safe_name(row.key) / f"{seq:02d}_{base}"
    return out / base


def download(row: Row, dest: Path, skip_existing: bool, timeout: int) -> Path:
    if skip_existing and dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(row.url, headers={"User-Agent": UA})
    with urlopen(req, timeout=timeout) as resp:
        ctype = resp.headers.get("Content-Type", "")
        if not ctype.startswith("image/"):
            raise ValueError(f"not an image (Content-Type={ctype})")
        if dest.suffix == "":
            dest = dest.with_suffix(mimetypes.guess_extension(ctype.split(";")[0]) or ".jpg")
        tmp = dest.with_suffix(dest.suffix + ".part")
        with tmp.open("wb") as f:
            while chunk := resp.read(1 << 16):
                f.write(chunk)
        tmp.replace(dest)
    return dest


# ---------- API ----------

class ApiClient:
    def __init__(self, base: str, token: Optional[str] = None, timeout: int = 60):
        self.base = base.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._product_cache: dict[str, Optional[dict]] = {}

    def _request(self, method: str, path: str, body: Optional[bytes] = None, headers: Optional[dict] = None) -> dict:
        h = {"User-Agent": UA, "Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if headers:
            h.update(headers)
        req = Request(f"{self.base}{path}", data=body, method=method, headers=h)
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from None

    def login(self, identifier: str, password: str) -> None:
        body = json.dumps({"identifier": identifier, "password": password}).encode()
        data = self._request("POST", "/auth/login", body, {"Content-Type": "application/json"})
        self.token = data.get("token") or (data.get("data") or {}).get("token")
        if not self.token:
            raise RuntimeError(f"Login response has no token: {data}")

    def product_by_barcode(self, barcode: str) -> Optional[dict]:
        if barcode in self._product_cache:
            return self._product_cache[barcode]
        try:
            p = self._request("GET", f"/products/barcode/{quote(barcode, safe='')}")
            p = p.get("data", p)
            full = self._request("GET", f"/products/{p['id']}")
            p = full.get("data", full)
        except RuntimeError as e:
            if "-> 404" not in str(e):
                raise
            p = None
        self._product_cache[barcode] = p
        return p

    def find_product(self, candidates: list[str]) -> Optional[dict]:
        """Try barcode, then SKU, then Handle (mirrors ShopifyCsvParser's barcode fallback)."""
        for c in candidates:
            p = self.product_by_barcode(c)
            if p:
                return p
        return None

    def upload_image(self, product_id: int, file: Path) -> dict:
        boundary = f"----mk{uuid.uuid4().hex}"
        ctype = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        head = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{file.name}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n"
        ).encode()
        body = head + file.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
        return self._request(
            "POST", f"/products/{product_id}/images", body,
            {"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )


# ---------- Orchestration ----------

def process(row: Row, dest: Path, args, api: Optional[ApiClient]) -> Result:
    res = Result(row)
    try:
        res.path = download(row, dest, args.skip_existing, args.timeout)
    except (HTTPError, URLError, ValueError, OSError) as e:
        res.error = f"download: {e}"
        return res

    if not api:
        return res
    if not row.lookup:
        res.skipped = "no barcode/sku/handle"
        return res
    try:
        product = api.find_product(row.lookup)
        if not product:
            res.skipped = f"product not found: {' / '.join(row.lookup)}"
            return res
        images = product.get("images") or []
        if any(img.get("url") == row.url for img in images):
            res.skipped = "already attached"
            return res
        if len(images) >= MAX_IMAGES:
            res.skipped = f"product already has {MAX_IMAGES} images"
            return res
        if args.dry_run:
            res.skipped = f"dry-run: would upload to product {product['id']}"
            return res
        api.upload_image(int(product["id"]), res.path)
        images.append({"url": row.url})  # keep cache count in sync for subsequent rows
        res.uploaded = True
    except RuntimeError as e:
        res.error = f"upload: {e}"
    return res


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", type=Path)
    ap.add_argument("--out", type=Path, default=Path("images"), help="output directory (default: ./images)")
    ap.add_argument("--url-col", help="CSV column holding the image URL (auto-detected)")
    ap.add_argument("--key-col", help="CSV column holding the product barcode (auto-detected)")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--timeout", type=int, default=60)
    ap.add_argument("--skip-existing", action="store_true", help="skip download if file already exists")
    ap.add_argument("--upload", action="store_true", help="upload downloaded images to matching products via API")
    ap.add_argument("--api-base", default=os.environ.get("API_BASE", DEFAULT_API))
    ap.add_argument("--token", default=os.environ.get("API_TOKEN"), help="admin JWT (or env API_TOKEN)")
    ap.add_argument("--identifier", default=os.environ.get("API_USER"), help="admin login (or env API_USER)")
    ap.add_argument("--password", default=os.environ.get("API_PASS"), help="admin password (or env API_PASS)")
    ap.add_argument("--dry-run", action="store_true", help="with --upload: resolve products but do not upload")
    ap.add_argument("--report", type=Path, help="write per-row results CSV here")
    args = ap.parse_args()

    rows = read_rows(args.csv, args.url_col, args.key_col)
    if not rows:
        sys.exit("No image URLs found in CSV.")
    print(f"{len(rows)} image URL(s) found")

    api = None
    if args.upload:
        api = ApiClient(args.api_base, args.token, args.timeout)
        if not api.token and not args.dry_run:
            if not (args.identifier and args.password):
                sys.exit("--upload needs --token or --identifier/--password (or API_TOKEN / API_USER / API_PASS env)")
            api.login(args.identifier, args.password)
            print("logged in")

    # sequence per product key so filenames are stable (01_, 02_, ...)
    seq: dict[str, int] = {}
    jobs = []
    for r in rows:
        k = r.key or "__nokey__"
        seq[k] = seq.get(k, 0) + 1
        jobs.append((r, target_path(args.out, r, seq[k])))

    # rows of one product run sequentially (keeps image order); products run in parallel
    groups: dict[str, list] = {}
    for r, d in jobs:
        groups.setdefault(r.key or f"__{r.line}", []).append((r, d))

    def run_group(items):
        return [process(r, d, args, api) for r, d in items]

    results: list[Result] = []
    n = 0
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as ex:
        for fut in as_completed([ex.submit(run_group, g) for g in groups.values()]):
            for res in fut.result():
                n += 1
                results.append(res)
                status = "ERR " if res.error else "SKIP" if res.skipped else "UP  " if res.uploaded else "OK  "
                detail = res.error or res.skipped or str(res.path)
                print(f"[{n}/{len(jobs)}] {status} line {res.row.line} {res.row.key or '-'}: {detail}")

    ok = sum(1 for r in results if r.path and not r.error)
    err = sum(1 for r in results if r.error)
    up = sum(1 for r in results if r.uploaded)
    sk = sum(1 for r in results if r.skipped)
    print(f"\ndownloaded={ok} uploaded={up} skipped={sk} errors={err}")

    if args.report:
        with args.report.open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["line", "barcode", "url", "file", "uploaded", "skipped", "error"])
            for r in sorted(results, key=lambda x: x.row.line):
                w.writerow([r.row.line, r.row.key or "", r.row.url, r.path or "", r.uploaded, r.skipped or "", r.error or ""])
        print(f"report written to {args.report}")
    return 1 if err else 0


if __name__ == "__main__":
    sys.exit(main())
