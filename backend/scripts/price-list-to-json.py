# -*- coding: utf-8 -*-
"""
Turn "EGYPT PRICE LIST.xlsx" into price-list.json for sync-price-list.mjs.

Everything on the store comes from the sheet, nothing is made up:
  - one product per "Item Name", with every "Item Size" of that name as a size, text as written
  - price = "PRICE" column; rows marked "Non Active" or without a price are not sellable
  - category, origin, process, roasting, notes, altitude and description ("Marketing features")
    from the sheet (first row of the product that has a value)
  - no Arabic text, grind types, weights, brands or flavours that the sheet doesn't contain

  python3 scripts/price-list-to-json.py "/path/EGYPT PRICE LIST.xlsx" > scripts/price-list.json
"""
import json
import re
import sys

import openpyxl

COL = {
    "category": 0, "sub": 1, "item": 2, "status": 3, "name": 4, "size": 5, "origin": 6,
    "process": 7, "roasting": 8, "type": 9, "notes": 10, "grade": 11, "altitude": 12,
    "marketing": 13, "price": 23,
}

# Existing site product to reuse for each sheet name (keeps its photos and its link)
SITE_SKU = {
    "Verona": "DBC-WC-004",
    "Florence": "DBC-WC-006",
    "Roma": "DBC-WC-007",
    "Milan": "DBC-WC-003",
    "Venice": "DBC-WC-005",
    "Mix": "DBC-WC-026",
    "Verona Ethipian Kaffa Tega specialty Coffee Beans": "DBC-WC-017",
    "Florance speciality Coffee Beans": "DBC-WC-020",
    "GESHA Ethiopian Chaka Specialty Coffee Beans": "DBC-WC-022",
    "Colombia Coffee Huila Specialty Coffee Beans": "DBC-WC-023",
    "Brazil Santos Specialty Coffee": "DBC-WC-024",
    "Guatemala AA SHB Specialty Coffee": "DBC-WC-021",
    "Nicaragua Buenos Aires Specialty Coffee": "DBC-WC-019",
    "Torino Espresso Roasted Coffee Beans": "DBC-WC-012",
    "Afandi Turkish Coffee": "DBC-WC-015",
    "Afandi Turkish Coffee With Cardamom": "DBC-WC-014",
    "Afandi Turkish Coffee With Cardamom & Mastika": "DBC-WC-016",
    "Oriental Arabic Coffee": "DBC-WC-011",
    "Oriental Arabic Coffee With Cardamom": "DBC-WC-009",
    "Oriental Arabic Coffee With Cardamom & Mastika": "DBC-WC-010",
    "Ethiopian Gesha Specialty Coffee Beans": "DBC-WC-018",
    "Arezzo Espresso Roasted Coffee Beans": "DBC-WC-013",
    # Not on the site yet (only created if it has a sellable size)
    "Aroma Espresso Roasted Coffee Beans": "DBC-WC-028",
}


def text(v):
    """Cell text as written: trims the ends and turns non-breaking spaces into spaces."""
    if v is None:
        return ""
    return str(v).replace("\xa0", " ").strip()


def roast_level(raw):
    """The sheet's roasting text → the site's roast scale; blank when the sheet doesn't say one."""
    r = raw.lower()
    if "medium" in r and "dark" in r:
        return "MEDIUM_DARK"
    if "dark" in r:
        return "DARK"
    if "medium" in r:
        return "MEDIUM"
    if "light" in r:
        return "LIGHT"
    return ""


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    products = {}
    order = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue
        name = re.sub(r"\s+", " ", text(row[COL["name"]]))
        if not name:
            continue
        if name not in products:
            products[name] = {"name": name, "siteSku": SITE_SKU.get(name), "fields": {}, "sizes": [], "unsellable": []}
            order.append(name)
        p = products[name]
        for field in ("category", "origin", "process", "roasting", "notes", "altitude", "marketing"):
            value = text(row[COL[field]])
            if value and field not in p["fields"]:
                p["fields"][field] = value

        size = text(row[COL["size"]])
        status = text(row[COL["status"]]).lower()
        price = row[COL["price"]]
        grams = re.search(r"(\d+)\s*gm\b", size, re.I)
        capsules = re.search(r"\bbag of (\d+)", size, re.I)
        entry = {
            "label": size,
            "sku": text(row[COL["item"]]),
            "weightGrams": int(grams.group(1)) if grams else None,
            "capsulesCount": int(capsules.group(1)) if capsules else None,
        }
        if status == "active" and isinstance(price, (int, float)) and price > 0:
            entry["priceCents"] = int(round(price * 100))
            p["sizes"].append(entry)
        else:
            entry["why"] = "Non Active" if status != "active" else "no price"
            p["unsellable"].append(entry)

    out = []
    for name in order:
        p = products[name]
        f = p["fields"]
        out.append({
            "name": name,
            "siteSku": p["siteSku"],
            "category": f.get("category", ""),
            "originCountry": f.get("origin", ""),
            "processingMethod": f.get("process", ""),
            "roastText": f.get("roasting", ""),
            "roastLevel": roast_level(f.get("roasting", "")),
            # The notes exactly as written (one piece of text, not split)
            "flavorNotes": [re.sub(r"\s+", " ", f["notes"]).strip()] if f.get("notes") else [],
            "elevation": f.get("altitude", ""),
            "description": f.get("marketing", ""),
            "sizes": p["sizes"],
            "unsellable": p["unsellable"],
        })
    json.dump({"products": out}, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
