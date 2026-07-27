frappe.ui.form.on("Barcode Generation Tool", {
    onload(frm) {
        setup_existing_batch_query(frm);
    },

    refresh(frm) {
        setup_existing_batch_query(frm);

        if (frm.doc.mode === 'Existing Batch' && frm.doc.existing_batch && (!frm.doc.manufacturing_date || !frm.doc.expiry_date)) {
            frm.trigger('existing_batch');
        }

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
    },

    mode(frm) {
        setup_existing_batch_query(frm);
        if (frm.doc.mode === 'New Pre-Batch') {
            frm.set_value('existing_batch', '');
        } else {
            frm.set_value('batch_no', '');
        }
    },

    item_code(frm) {
        setup_existing_batch_query(frm);
        frm.set_value('existing_batch', '');
        frm.set_value('batch_no', '');
    },

    async existing_batch(frm) {
        if (frm.doc.existing_batch) {
            try {
                let r = await frappe.db.get_value('Batch', frm.doc.existing_batch, ['manufacturing_date', 'expiry_date', 'item']);
                let values = r && r.message ? r.message : r;
                if (values) {
                    let update_dict = {
                        'manufacturing_date': values.manufacturing_date || '',
                        'expiry_date': values.expiry_date || ''
                    };
                    if (values.item && !frm.doc.item_code) {
                        update_dict['item_code'] = values.item;
                    }
                    await frm.set_value(update_dict);
                }
            } catch(e) {
                console.error('Error fetching batch details:', e);
            }
        } else {
            await frm.set_value({
                'manufacturing_date': '',
                'expiry_date': ''
            });
        }
    }
});

function setup_existing_batch_query(frm) {
    frm.set_query('existing_batch', () => {
        let filters = { disabled: 0 };
        if (frm.doc.item_code) {
            filters.item = frm.doc.item_code;
        }
        return { filters: filters };
    });
}
