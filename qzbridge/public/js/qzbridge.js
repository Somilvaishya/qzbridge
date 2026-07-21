window.QZBridge = {
    /**
     * Entry point for consumers to trigger a print.
     * @param {string} doctype - The source doctype (e.g., 'Purchase Receipt')
     * @param {string} docname - The source docname (e.g., 'MAT-PRE-2026-0001')
     * @param {object} doc_data - Flattened dictionary of document fields to use in Jinja
     */
    print_dialog: function(doctype, docname, doc_data) {
        // Prepare context
        let context = Object.assign({}, doc_data);
        context._source_doctype = doctype;
        context._source_name = docname;

        // Ensure QZ is ready
        window.QZBridgeConnect.init().then(() => {
            // Fetch applicable templates
            frappe.call({
                method: 'qzbridge.api.get_templates_for_doctype',
                args: { doctype: doctype },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        let dialog = new window.QZPrintDialog(r.message, context);
                        dialog.show();
                    } else {
                        frappe.msgprint(__('No active Label Templates found for this Document Type.'));
                    }
                }
            });
        });
    },

    /**
     * Executes the actual print to QZ Tray.
     * @param {string} printer - Printer Name
     * @param {string} template_name - Template ID
     * @param {object} context - Jinja Context
     */
    execute_print: function(printer, template_name, context) {
        return new Promise((resolve, reject) => {
            // 1. Get raw commands from server
            frappe.call({
                method: 'qzbridge.api.get_print_data',
                args: {
                    template_name: template_name,
                    context_json: JSON.stringify(context)
                },
                callback: function(r) {
                    if (!r.message || !r.message.commands) {
                        reject("Failed to generate raw print commands");
                        return;
                    }
                    let commands = r.message.commands;
                    
                    // 2. Send to QZ Tray
                    var config = qz.configs.create(printer);
                    var data = commands.map(c => c + '\n');
                    
                    qz.print(config, data).then(() => {
                        // 3. Log Success
                        frappe.call({
                            method: 'qzbridge.api.log_print',
                            args: {
                                template_name: template_name,
                                context_json: JSON.stringify(context),
                                printer: printer,
                                status: "Success"
                            }
                        });
                        frappe.show_alert({message: __('Print Job Sent Successfully'), indicator: 'green'});
                        resolve();
                    }).catch(err => {
                        // 4. Log Failure
                        frappe.call({
                            method: 'qzbridge.api.log_print',
                            args: {
                                template_name: template_name,
                                context_json: JSON.stringify(context),
                                printer: printer,
                                status: "Failed",
                                error_log: String(err)
                            }
                        });
                        frappe.msgprint({title: __('Print Failed'), message: String(err), indicator: 'red'});
                        reject(err);
                    });
                },
                error: function(err) {
                    reject(err);
                }
            });
        });
    }
};
