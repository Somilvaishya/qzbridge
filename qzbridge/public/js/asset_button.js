frappe.ui.form.on('Asset', {
    refresh: function(frm) {
        // Ensure the asset is saved before allowing printing
        if (!frm.is_new()) {
            frm.add_custom_button(__('Print Barcode/QR'), () => {
                
                // Collect relevant document data for the context
                let doc_data = Object.assign({}, frm.doc);
                
                // Set default copies to 1
                doc_data.no_of_copies = 1;
                
                // Wrap the single asset in an 'items' array. 
                // This allows the standard QZBridge Label Template Jinja loop 
                // {% for item in items %} to work perfectly.
                doc_data.items = [frm.doc];
                
                // Invoke QZBridge
                if (window.QZBridge) {
                    window.QZBridge.print_dialog(frm.doctype, frm.docname, doc_data);
                } else {
                    frappe.msgprint(__('QZBridge is not loaded. Please refresh the page.'));
                }
                
            }, __('Actions'));
        }
    }
});
