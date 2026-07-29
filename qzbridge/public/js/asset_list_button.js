frappe.listview_settings['Asset'] = {
    onload: function(listview) {
        listview.page.add_action_item(__('Print Barcode/QR'), function() {
            let checked_items = listview.get_checked_items();
            
            if (!checked_items || checked_items.length === 0) {
                frappe.msgprint(__('Please select at least one Asset to print.'));
                return;
            }

            // Extract the names of the selected assets
            let asset_names = checked_items.map(item => item.name);

            // Fetch the full documents for these assets to ensure Jinja has access to all fields
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Asset',
                    filters: { name: ['in', asset_names] },
                    fields: ['*'], // Fetch all fields for the template context
                    limit_page_length: asset_names.length
                },
                callback: function(r) {
                    if (r.message) {
                        let doc_data = {
                            no_of_copies: 1,
                            items: r.message
                        };

                        if (window.QZBridge) {
                            window.QZBridge.print_dialog('Asset', 'Bulk Print', doc_data);
                        } else {
                            frappe.msgprint(__('QZBridge is not loaded. Please refresh the page.'));
                        }
                    }
                }
            });
        });
    }
};
