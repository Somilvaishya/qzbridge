import frappe
import json
from jinja2 import Template

def render(template_name, context):
    """
    Renders the raw print code for a Label Template, injecting Jinja variables
    and appending necessary headers (for TSPL).
    Returns a list of string commands.
    """
    if not frappe.db.exists("Label Template", template_name):
        return []
        
    doc = frappe.get_doc("Label Template", template_name)
    raw_code = doc.raw_code or ""

    if not isinstance(context, dict):
        context = {}

    # Provide default template variables so Jinja expressions like `scale`, `is_preview`, `no_of_copies` never raise UndefinedError
    context.setdefault("scale", 1.5)
    context.setdefault("is_preview", False)
    context.setdefault("no_of_copies", 1)

    # If context has items, ensure each item has print_qty and batch_no defined
    if "items" in context and isinstance(context["items"], list):
        for item in context["items"]:
            if isinstance(item, dict):
                item.setdefault("print_qty", item.get("qty", 1))
                item.setdefault("item_name", item.get("item_code", ""))
                item.setdefault("batch_no", "")

    # Render Jinja variables using Frappe's engine (supports all Frappe filters like trim, _ , etc.)
    try:
        rendered_body = frappe.render_template(raw_code, context)
    except Exception as e:
        frappe.log_error(f"Frappe render_template error in {template_name}: {str(e)}", "QZBridge Engine")
        try:
            jinja_tmpl = Template(raw_code)
            rendered_body = jinja_tmpl.render(**context)
        except Exception as e2:
            frappe.log_error(f"Fallback Jinja render error in {template_name}: {str(e2)}", "QZBridge Engine")
            rendered_body = raw_code

    commands = []
    
    if doc.printer_language == "TSPL":
        # Inject standard TSPL headers based on template settings
        commands.append(f"SIZE {doc.width_mm} mm,{doc.height_mm} mm")
        if doc.gap_mm:
            commands.append(f"GAP {doc.gap_mm} mm,0 mm")
        else:
            commands.append("GAP 0 mm,0 mm")
            
        commands.append(f"DENSITY {doc.density or 8}")
        commands.append(f"SPEED {doc.speed or 4}")
        commands.append("DIRECTION 1,0")
        commands.append("REFERENCE 0,0")
        commands.append("OFFSET 0 mm")
        commands.append("SET PEEL OFF")
        commands.append("SET CUT OFF")
        commands.append("SET TEAR ON")
        commands.append("CLS")
        
        # Append the user's rendered body
        commands.extend(rendered_body.split('\n'))
        
        # Add the print command
        copies = context.get('no_of_copies', 1)
        commands.append(f"PRINT 1,{copies}")
        
    else:
        # For ZPL and EPL, the user typically writes the full envelope (^XA...^XZ or N...P1)
        commands = rendered_body.split('\n')
        
    # Clean up empty lines
    return [cmd.strip() for cmd in commands if cmd.strip()]

@frappe.whitelist()
def preview(template_name, context):
    """
    Server-side preview stub.
    Returns the context and rendered commands so JS can render preview.
    """
    if isinstance(context, str):
        context = json.loads(context)
        
    doc = frappe.get_doc("Label Template", template_name)
    rendered_cmds = render(template_name, context)
    
    declared_vars = [v.strip() for v in (doc.variables or "").split(",") if v.strip()]
    missing = [v for v in declared_vars if not context.get(v)]
    
    return {
        "ok": True,
        "width_mm": doc.width_mm,
        "height_mm": doc.height_mm,
        "printer_language": doc.printer_language,
        "tspl": rendered_cmds,
        "fields": context,
        "missing": missing,
        "warnings": ["Missing context variables"] if missing else []
    }
