# Copyright (c) 2026, Somil and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class BarcodeGenerationTool(Document):
	def on_submit(self):
		if self.mode == "New Pre-Batch":
			self.create_batch()

	def create_batch(self):
		if not self.batch_no:
			frappe.throw(_("Batch No is required to create a new batch."))

		if frappe.db.exists("Batch", self.batch_no):
			frappe.msgprint(
				_("Batch {0} already exists. Skipping batch creation.").format(self.batch_no),
				alert=True,
			)
			return

		batch = frappe.get_doc({
			"doctype": "Batch",
			"batch_id": self.batch_no,
			"item": self.item_code,
			"manufacturing_date": self.manufacturing_date,
			"expiry_date": self.expiry_date,
		})
		batch.insert(ignore_permissions=True)
		frappe.msgprint(
			_("Batch {0} created successfully.").format(self.batch_no),
			alert=True,
			indicator="green",
		)
