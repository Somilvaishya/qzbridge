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
