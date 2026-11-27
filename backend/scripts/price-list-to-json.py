# -*- coding: utf-8 -*-
"""
Turn the "EGYPT PRICE LIST.xlsx" sheet into price-list.json for sync-price-list.mjs.
One sheet row = one size of a product. Rows marked "Non Active" or without a price are
not sellable and are reported, never invented.

  python3 scripts/price-list-to-json.py "/path/EGYPT PRICE LIST.xlsx" > scripts/price-list.json
"""
import json
import re
import sys

import openpyxl

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")

# Sheet product → product SKU on the site (None = create a new product)
SLEEVE = {"verona": "DBC-WC-004", "florence": "DBC-WC-006", "roma": "DBC-WC-007", "milan": "DBC-WC-003", "venice": "DBC-WC-005"}
BAG = {"verona": None, "florence": "DBC-WC-002", "roma": "DBC-WC-001", "milan": "DBC-WC-025", "venice": "DBC-WC-008", "mix": "DBC-WC-026"}
NAMED = {
    "verona ethipian kaffa tega specialty coffee beans": "DBC-WC-017",
    "florance speciality coffee beans": "DBC-WC-020",
    "gesha ethiopian chaka specialty coffee beans": "DBC-WC-022",
    "colombia coffee huila specialty coffee beans": "DBC-WC-023",
    "brazil santos specialty coffee": "DBC-WC-024",
    "guatemala aa shb specialty coffee": "DBC-WC-021",
    "nicaragua buenos aires specialty coffee": "DBC-WC-019",
    "torino espresso roasted coffee beans": "DBC-WC-012",
    "aroma espresso roasted coffee beans": None,
    "afandi turkish coffee": "DBC-WC-015",
    "afandi turkish coffee with cardamom": "DBC-WC-014",
    "afandi turkish coffee with cardamom & mastika": "DBC-WC-016",
    "oriental arabic coffee": "DBC-WC-011",
    "oriental arabic coffee with cardamom": "DBC-WC-009",
    "oriental arabic coffee with cardamom & mastika": "DBC-WC-010",
    "ethiopian gesha specialty coffee beans": "DBC-WC-018",
    "arezzo espresso roasted coffee beans": "DBC-WC-013",
}
NEW_PRODUCTS = {
    "bag:verona": {
        "sku": "DBC-WC-027",
        "name": "Verona Coffee Capsules Bag",
        "nameAr": "كيس كبسولات قهوة فيرونا",
        "copyFrom": "DBC-WC-004",
    },
    "named:aroma espresso roasted coffee beans": {
        "sku": "DBC-WC-028",
        "name": "Aroma Espresso Roasted Coffee Beans",
        "nameAr": "بن أروما إسبريسو محمّص",
        "copyFrom": "DBC-WC-012",
    },
}


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    products = {}
    skipped = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue
        item_no, status, name, size, price = row[2], norm(row[3]), norm(row[4]), norm(row[5]), row[23]
        key_name = name.lower()
        size_l = size.lower()

        m_sleeve = re.search(r"sleeve pack of (\d+)", size_l)
        m_bag = re.search(r"bag of (\d+)", size_l)
        m_gm = re.search(r"(\d+)\s*gm", size_l)
        if m_sleeve:
            key, site_sku = f"sleeve:{key_name}", SLEEVE.get(key_name, "?")
            n = int(m_sleeve.group(1))
            variant = {
                "label": f"Sleeve pack of {n}",
                "labelAr": f"عبوة {str(n).translate(AR_DIGITS)} سليف",
                "capsulesCount": None,
                "weightGrams": None,
                "order": n,
            }
        elif m_bag:
            key, site_sku = f"bag:{key_name}", BAG.get(key_name, "?")
            n = int(m_bag.group(1))
            variant = {
                "label": f"Bag of {n} capsules",
                "labelAr": f"كيس {str(n).translate(AR_DIGITS)} كبسولة",
                "capsulesCount": n,
                "weightGrams": None,
                "order": n,
            }
        elif m_gm:
            key, site_sku = f"named:{key_name}", NAMED.get(key_name, "?")
            g = int(m_gm.group(1))
            variant = {
                "label": f"{g}g",
                "labelAr": f"{str(g).translate(AR_DIGITS)} جم",
                "capsulesCount": None,
                "weightGrams": g,
                "order": g,
            }
        else:
            skipped.append({"item": item_no, "name": name, "size": size, "why": "size not understood"})
            continue

        product = products.setdefault(
            key,
            {"key": key, "sheetName": name, "siteSku": site_sku, "new": NEW_PRODUCTS.get(key), "variants": [], "unsellable": []},
        )
        sellable = status.lower() == "active" and isinstance(price, (int, float)) and price > 0
        entry = {**variant, "sku": str(item_no), "size": size}
        if sellable:
            entry["priceCents"] = int(round(price * 100))
            product["variants"].append(entry)
        else:
            entry["why"] = "Non Active" if status.lower() != "active" else "no price"
            product["unsellable"].append(entry)

    for p in products.values():
        p["variants"].sort(key=lambda v: v["order"])
    json.dump({"products": list(products.values()), "skipped": skipped}, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
