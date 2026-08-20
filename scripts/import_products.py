import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "products.csv"
OUTPUT = ROOT / "public" / "products.json"
REPORT = ROOT / "data" / "import-report.json"
REVIEW_CATEGORIES = {"🍄", "POD"}


def number(value):
    value = (value or "").strip().replace(",", "")
    if not value:
        return None
    try:
        parsed = float(value)
        return int(parsed) if parsed.is_integer() else parsed
    except ValueError:
        return None


with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
    rows = list(csv.DictReader(handle))

public_products = []
review_count = 0
hidden_count = 0

for row in rows:
    category = row["category"].strip()
    status = row["status"].strip().upper() or "HIDDEN"
    if status != "ACTIVE":
        hidden_count += 1
        continue
    if category in REVIEW_CATEGORIES:
        review_count += 1
        continue

    identity = f'{row["name"].strip()}|{category}|{row["variantName"].strip()}'
    product_id = row["productId"].strip() or f'JIGz-{hashlib.sha256(identity.encode()).hexdigest()[:8].upper()}'
    prices = {
        size: number(row[f"price{size}"])
        for size in ("1", "10", "30", "50", "100", "500", "1000")
        if number(row[f"price{size}"]) is not None
    }
    images = [row[f"image{i}"].strip() for i in range(1, 6) if row[f"image{i}"].strip()]
    public_products.append({
        "id": product_id,
        "name": row["name"].strip(),
        "brand": row["brand"].strip() or "JIGz",
        "category": category or "อื่นๆ",
        "unit": row["unit"].strip() or "ชิ้น",
        "price": number(row["price"]) or number(row["price1"]),
        "prices": prices,
        "stock": number(row["stock"]),
        "images": images,
    })

OUTPUT.write_text(json.dumps({"products": public_products}, ensure_ascii=False, indent=2), encoding="utf-8")
REPORT.write_text(json.dumps({
    "sourceRows": len(rows),
    "publishedRows": len(public_products),
    "hiddenRows": hidden_count,
    "reviewRows": review_count,
    "reviewCategories": sorted(REVIEW_CATEGORIES),
}, ensure_ascii=False, indent=2), encoding="utf-8")
