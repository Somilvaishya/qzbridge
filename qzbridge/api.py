import frappe
import json
from qzbridge.engine import render, preview
from qzbridge.helpers import log_print as _log_print, fetch_data, expand_by_carton

@frappe.whitelist()
def get_print_data(template_name, context_json):
    """
    Called by JS qzbridge.print() to get the raw commands for QZ Tray.
    """
    context = json.loads(context_json) if isinstance(context_json, str) else context_json
    commands = render(template_name, context)
    return {
        "commands": commands
    }

@frappe.whitelist()
def log_print(template_name, context_json, printer, status="Success", error_log=""):
    """
    Called by JS qzbridge.print() after QZ Tray resolves or rejects.
    """
    context = json.loads(context_json) if isinstance(context_json, str) else context_json
    log_name = _log_print(template_name, context, printer, status, error_log)
    return log_name

@frappe.whitelist()
def get_templates_for_doctype(doctype):
    """
    Returns templates that apply to a specific doctype (or apply to all).
    """
    templates = frappe.get_all(
        "Label Template",
        filters={"is_active": 1},
        or_filters={"applies_to": doctype, "applies_to": ["in", ["", None]]},
        fields=["name", "template_name", "printer_language"]
    )
    return templates

@frappe.whitelist()
def generate_carton_data(items_json, qty_per_carton):
    """
    Expands a list of items into individual cartons based on qty_per_carton.
    """
    items = json.loads(items_json) if isinstance(items_json, str) else items_json
    return expand_by_carton(items, qty_per_carton)

@frappe.whitelist()
def enrich_items_with_batches(items_json):
    """
    Enriches item rows with batch_no. If batch_no is missing but serial_and_batch_bundle exists,
    fetches batches from the bundle and splits the row if there are multiple batches.
    """
    items = json.loads(items_json) if isinstance(items_json, str) else items_json
    if not items:
        return []
        
    enriched_items = []
    
    for item in items:
        batch_no = item.get("batch_no")
        bundle_id = item.get("serial_and_batch_bundle")
        
        if batch_no:
            enriched_items.append(item)
            continue
            
        if bundle_id:
            entries = frappe.db.get_all(
                "Serial and Batch Entry",
                filters={"parent": bundle_id},
                fields=["batch_no", "qty"]
            )
            
            if entries:
                added = False
                for entry in entries:
                    if entry.batch_no:
                        new_item = item.copy()
                        new_item["batch_no"] = entry.batch_no
                        new_item["qty"] = abs(entry.qty) if entry.qty else new_item.get("qty", 1)
                        # Remove bundle so we don't duplicate logic accidentally later
                        new_item["serial_and_batch_bundle"] = None 
                        enriched_items.append(new_item)
                        added = True
                
                if added:
                    continue
                    
        # If no batch found
        enriched_items.append(item)
        
    return enriched_items
