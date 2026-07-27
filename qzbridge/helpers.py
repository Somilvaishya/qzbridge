import frappe
from frappe.utils import now_datetime, flt

def log_print(template, context, printer, status="Success", error_log=""):
    """
    Logs the print job to the Label Print Log doctype.
    """
    try:
        log = frappe.new_doc("Label Print Log")
        log.print_datetime = now_datetime()
        log.printed_by = frappe.session.user
        log.template = template
        log.printer = printer
        log.status = status
        log.error_log = error_log
        
        # Calculate total label count
        total_qty = 0
        items = context.get('items', [])
        if items:
            for item in items:
                total_qty += int(item.get('print_qty', 1))
        else:
            total_qty = int(context.get('no_of_copies', 1))
            
        log.label_count = total_qty
        log.source_doctype = context.get('_source_doctype')
        log.source_name = context.get('_source_name')
        
        log.insert(ignore_permissions=True)
        frappe.db.commit()
        return log.name
    except Exception as e:
        frappe.log_error(f"Failed to log print: {str(e)}", "QZBridge Log Error")
        return None

def get_uom_conversion_factor(item_code, target_uom):
    """
    Fetches the conversion factor for a given item_code and target_uom from ERPNext UOM Conversion Detail table or Item doctype.
    Returns flt(conversion_factor) if found, else 1.0.
    """
    if not item_code or not target_uom:
        return 1.0
        
    stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
    if stock_uom and stock_uom.strip().lower() == target_uom.strip().lower():
        return 1.0

    # Search in UOM Conversion Detail child table
    cf = frappe.db.get_value("UOM Conversion Detail", {"parent": item_code, "uom": target_uom}, "conversion_factor")
    if cf:
        return flt(cf)
        
    return 1.0

def expand_by_carton(items, default_qty_per_carton=None, global_uom=None):
    """
    Takes a list of items and breaks them down into individual carton objects.
    Supports per-item custom qty_per_carton, global_uom conversion factor, or item level uom conversion.
    """
    expanded_items = []
    
    for item in items:
        total_qty = flt(item.get("qty") or item.get("received_qty") or item.get("stock_qty") or item.get("stock_qty_val"))
        item_code = item.get("item_code")
        
        # Determine qty_per_carton for this specific item
        per_carton = flt(item.get("qty_per_carton") or item.get("carton_qty_setting"))
        
        target_uom = item.get("carton_uom") or item.get("uom") or global_uom
        
        if per_carton <= 0 and target_uom and item_code:
            cf = get_uom_conversion_factor(item_code, target_uom)
            if cf > 0:
                per_carton = cf
                
        if per_carton <= 0 and default_qty_per_carton:
            per_carton = flt(default_qty_per_carton)
            
        if per_carton <= 0:
            frappe.throw(frappe._("Qty per Carton is required and must be greater than 0 for item {0}").format(item_code or item.get('item_name', '')))
            
        if total_qty <= 0 or per_carton <= 0:
            new_item = item.copy()
            new_item['carton_no'] = 1
            new_item['total_cartons'] = 1
            new_item['carton_qty'] = total_qty
            new_item['carton_uom'] = target_uom or item.get('stock_uom', '')
            expanded_items.append(new_item)
            continue
            
        full_cartons = int(total_qty // per_carton)
        remainder = total_qty % per_carton
        total_cartons = full_cartons + (1 if remainder > 0 else 0)
        
        current_carton = 1
        for _ in range(full_cartons):
            new_item = item.copy()
            new_item['carton_no'] = current_carton
            new_item['total_cartons'] = total_cartons
            new_item['carton_qty'] = per_carton
            new_item['carton_uom'] = target_uom or item.get('stock_uom', '')
            new_item['qty'] = per_carton # Override for display
            expanded_items.append(new_item)
            current_carton += 1
            
        if remainder > 0:
            new_item = item.copy()
            new_item['carton_no'] = current_carton
            new_item['total_cartons'] = total_cartons
            new_item['carton_qty'] = remainder
            new_item['carton_uom'] = target_uom or item.get('stock_uom', '')
            new_item['qty'] = remainder
            expanded_items.append(new_item)
            
    return expanded_items

def fetch_data(doctype, docname):
    """
    Returns a flattened dictionary of a Frappe document to use as context for Jinja.
    """
    if not frappe.db.exists(doctype, docname):
        return {}
    
    doc = frappe.get_doc(doctype, docname)
    context = doc.as_dict()
    
    # Add a few common helpers
    context["_source_doctype"] = doctype
    context["_source_name"] = docname
    
    return context
