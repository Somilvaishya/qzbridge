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

def expand_by_carton(items, qty_per_carton):
    """
    Takes a list of items and breaks them down into individual carton objects.
    e.g. if Qty is 50 and Qty/Carton is 20, returns 3 objects with quantities 20, 20, and 10.
    """
    expanded_items = []
    
    for item in items:
        total_qty = flt(item.get("qty") or item.get("received_qty") or item.get("stock_qty"))
        per_carton = flt(qty_per_carton)
        
        if total_qty <= 0 or per_carton <= 0:
            item['carton_no'] = 1
            item['total_cartons'] = 1
            item['carton_qty'] = total_qty
            expanded_items.append(item)
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
            new_item['qty'] = per_carton # Override for display
            expanded_items.append(new_item)
            current_carton += 1
            
        if remainder > 0:
            new_item = item.copy()
            new_item['carton_no'] = current_carton
            new_item['total_cartons'] = total_cartons
            new_item['carton_qty'] = remainder
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
