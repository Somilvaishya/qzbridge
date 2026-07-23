"""
Patch: Fix `name` column type for Barcode Generation Tool

When naming was changed from `autoincrement` (bigint) to `naming_series` (varchar),
bench migrate does not automatically change the column type of the primary key.
This patch manually alters the column from bigint to varchar(140).
"""

import frappe


def execute():
	result = frappe.db.sql("""
		SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'tabBarcode Generation Tool'
		AND COLUMN_NAME = 'name'
	""", as_dict=1)

	if result and result[0].get("DATA_TYPE") in ("bigint", "int"):
		frappe.db.sql("""
			ALTER TABLE `tabBarcode Generation Tool`
			MODIFY COLUMN `name` VARCHAR(140) NOT NULL
		""")
		frappe.db.commit()
