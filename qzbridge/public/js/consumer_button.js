frappe.ui.form.on(cur_frm.doctype, {
    refresh: function(frm) {
        if (frm.doc.docstatus === 1) { // Submitted documents only
            frm.add_custom_button(__('Print Barcodes'), () => {
                
                // Collect relevant document data for the context
                let doc_data = Object.assign({}, frm.doc);
                
                // Add some useful derived fields or calculations
                // e.g. default copies to 1
                doc_data.no_of_copies = 1;
                
                // Invoke QZBridge
                if (window.QZBridge) {
                    window.QZBridge.print_dialog(frm.doctype, frm.docname, doc_data);
                } else {
                    frappe.msgprint(__('QZBridge is not loaded.'));
                }
                
            }, __('Actions'));
        }
    }
});
