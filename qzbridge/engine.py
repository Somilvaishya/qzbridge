import frappe
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
    
    # Render Jinja variables in the raw code
    raw_code = doc.raw_code or ""
    try:
        jinja_tmpl = Template(raw_code)
        rendered_body = jinja_tmpl.render(**context)
    except Exception as e:
        frappe.log_error(f"Jinja Render Error in {template_name}: {str(e)}", "QZBridge Engine")
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

import json

@frappe.whitelist()
def preview(template_name, context):
    """
    Server-side preview is a stub in Frappe, as we render preview on the client side 
    using the QZBridge JS library to interact with Labelary or HTML Canvas.
    We just return the context and TSPL so the JS dialog can render it.
    """
    if isinstance(context, str):
        context = json.loads(context)
        
    doc = frappe.get_doc("Label Template", template_name)
    rendered_cmds = render(template_name, context)
    
    # Identify missing vars
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
