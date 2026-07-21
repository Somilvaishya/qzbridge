frappe.ui.form.on("Barcode Generation Tool", {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Print Barcodes'), () => {
                let context = Object.assign({}, frm.doc);
                // Standardize the batch_no for printing
                if (frm.doc.mode === 'Existing Batch') {
                    context.batch_no = frm.doc.existing_batch;
                }
                
                if (window.QZBridge) {
                    window.QZBridge.print_dialog(frm.doctype, frm.docname, context);
                } else {
                    frappe.msgprint(__('QZBridge is not loaded.'));
                }
            }).addClass('btn-primary');
        }
    }
});
