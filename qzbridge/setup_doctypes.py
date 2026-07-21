import frappe

def create_doctypes():
    if frappe.db.exists("DocType", "Label Template"):
        frappe.delete_doc("DocType", "Label Template", force=1)
    if frappe.db.exists("DocType", "Label Print Log"):
        frappe.delete_doc("DocType", "Label Print Log", force=1)

    # 1. Label Template
    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "Label Template",
        "module": "QZBridge",
        "custom": 0,
        "autoname": "field:template_name",
        "naming_rule": "By fieldname",
        "fields": [
            {"fieldname": "template_name", "fieldtype": "Data", "label": "Template Name", "reqd": 1, "unique": 1},
            {"fieldname": "is_active", "fieldtype": "Check", "label": "Is Active", "default": "1"},
            {"fieldname": "applies_to", "fieldtype": "Link", "options": "DocType", "label": "Applies To (Hint)"},
            {"fieldname": "printer_language", "fieldtype": "Select", "label": "Printer Language", "options": "TSPL\nZPL\nEPL", "default": "TSPL", "reqd": 1},
            
            {"fieldname": "cb1", "fieldtype": "Column Break"},
            {"fieldname": "width_mm", "fieldtype": "Float", "label": "Width (mm)", "reqd": 1, "default": "100"},
            {"fieldname": "height_mm", "fieldtype": "Float", "label": "Height (mm)", "reqd": 1, "default": "50"},
            {"fieldname": "gap_mm", "fieldtype": "Float", "label": "Gap (mm)", "default": "2"},
            
            {"fieldname": "cb2", "fieldtype": "Column Break"},
            {"fieldname": "density", "fieldtype": "Int", "label": "Density", "default": "8", "description": "TSPL Density (0-15)"},
            {"fieldname": "speed", "fieldtype": "Int", "label": "Speed", "default": "4", "description": "TSPL Speed (inches/sec)"},
            
            {"fieldname": "sb1", "fieldtype": "Section Break"},
            {"fieldname": "raw_code", "fieldtype": "Code", "label": "Raw Printing Code (Jinja)"},
            
            {"fieldname": "cb3", "fieldtype": "Column Break"},
            {"fieldname": "preview_html", "fieldtype": "HTML", "label": "Live Preview"},
            
            {"fieldname": "sb2", "fieldtype": "Section Break"},
            {"fieldname": "variables", "fieldtype": "Small Text", "label": "Declared Variables (Comma separated)"}
        ],
        "permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1}]
    })
    doc.insert(ignore_permissions=True)
    print("Created Label Template DocType")
    
    # 2. Label Print Log
    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "Label Print Log",
        "module": "QZBridge",
        "custom": 0,
        "autoname": "autoincrement",
        "naming_rule": "Autoincrement",
        "fields": [
            {"fieldname": "print_datetime", "fieldtype": "Datetime", "label": "Print Datetime", "in_list_view": 1},
            {"fieldname": "printed_by", "fieldtype": "Link", "options": "User", "label": "Printed By", "in_list_view": 1},
            {"fieldname": "status", "fieldtype": "Select", "options": "Success\nFailed", "label": "Status", "in_list_view": 1},
            {"fieldname": "cb1", "fieldtype": "Column Break"},
            {"fieldname": "printer", "fieldtype": "Data", "label": "Printer", "in_list_view": 1},
            {"fieldname": "template", "fieldtype": "Link", "options": "Label Template", "label": "Template"},
            {"fieldname": "label_count", "fieldtype": "Int", "label": "Label Count"},
            {"fieldname": "sb1", "fieldtype": "Section Break"},
            {"fieldname": "source_doctype", "fieldtype": "Link", "options": "DocType", "label": "Source DocType"},
            {"fieldname": "source_name", "fieldtype": "Dynamic Link", "options": "source_doctype", "label": "Source Document"},
            {"fieldname": "error_log", "fieldtype": "Small Text", "label": "Error Log"}
        ],
        "permissions": [{"role": "System Manager", "read": 1}]
    })
    doc.insert(ignore_permissions=True)
    print("Created Label Print Log DocType")

    # 3. Barcode Generation Tool (Migrated Prebatch tool)
    if frappe.db.exists("DocType", "Barcode Generation Tool"):
        frappe.delete_doc("DocType", "Barcode Generation Tool", force=1)

    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "Barcode Generation Tool",
        "module": "QZBridge",
        "custom": 0,
        "issingle": 0,
        "is_submittable": 1,
        "autoname": "autoincrement",
        "naming_rule": "Autoincrement",
        "fields": [
            {"fieldname": "mode", "fieldtype": "Select", "label": "Mode", "options": "New Pre-Batch\nExisting Batch", "default": "New Pre-Batch", "reqd": 1, "in_list_view": 1},
            {"fieldname": "item_code", "fieldtype": "Link", "options": "Item", "label": "Item Code", "reqd": 1, "in_list_view": 1},
            {"fieldname": "batch_no", "fieldtype": "Data", "label": "Batch No", "depends_on": "eval:doc.mode == 'New Pre-Batch'", "mandatory_depends_on": "eval:doc.mode == 'New Pre-Batch'", "in_list_view": 1},
            {"fieldname": "existing_batch", "fieldtype": "Link", "options": "Batch", "label": "Existing Batch", "depends_on": "eval:doc.mode == 'Existing Batch'", "mandatory_depends_on": "eval:doc.mode == 'Existing Batch'", "in_list_view": 1},
            
            {"fieldname": "col_break_2", "fieldtype": "Column Break"},
            {"fieldname": "manufacturing_date", "fieldtype": "Date", "label": "Manufacturing Date"},
            {"fieldname": "expiry_date", "fieldtype": "Date", "label": "Expiry Date"},
            {"fieldname": "label_qty", "fieldtype": "Float", "label": "Qty on Label", "default": "1"}
        ],
        "permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "submit": 1}]
    })
    doc.insert(ignore_permissions=True)
    print("Created Barcode Generation Tool DocType")

    frappe.db.commit()
