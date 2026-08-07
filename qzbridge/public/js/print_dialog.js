window.QZPrintDialog = class QZPrintDialog {
    constructor(templates, context) {
        this.templates = templates;
        this.context = context || {};
        this.printers = [];
        this.selected_printer = localStorage.getItem('qz_default_printer') || '';
        this.selected_template = templates[0];
        this.grand_total_labels = 0;
        this.preview_ok = true;
    }

    show() {
        let me = this;
        window.QZBridgeConnect.getPrinters().then(printers => {
            me.printers = printers;
            if (!me.selected_printer && printers.length > 0) {
                me.selected_printer = printers[0];
            }
            me.context.printer = { name: me.selected_printer, dpi: 203, width: null, height: null };
            me._build_dialog();
            me._fetch_printer_details(me.selected_printer);
        });
    }

    _fetch_printer_details(printer_name) {
        let me = this;
        console.log("FETCHING PRINTER DETAILS FOR:", printer_name);
        window.QZBridgeConnect.getPrinterDetails(printer_name).then(details => {
            console.log("RAW PRINTER DETAILS FROM QZ:", details);
            let d = Array.isArray(details) ? details[0] : details;
            if (d) {
                me.context.printer = {
                    name: printer_name,
                    dpi: d.density || 203,
                    width: d.defaultPaperSize ? d.defaultPaperSize.width : null,
                    height: d.defaultPaperSize ? d.defaultPaperSize.height : null
                };
            }
            me._refresh_preview();
        }).catch(err => {
            console.warn("Could not fetch printer details:", err);
            me._refresh_preview();
        });
    }

    _build_dialog() {
        let me = this;
        let printer_options = this.printers.map(p => ({ label: p, value: p }));
        let template_options = this.templates.map(t => ({ label: t.template_name, value: t.name }));
        
        let has_items = this.context.items && this.context.items.length > 0;
        
        let fields = [
            { fieldname: 'status_html', fieldtype: 'HTML', label: '' },
            {
                fieldname: 'printer',
                fieldtype: 'Select',
                label: __('Select Printer'),
                options: printer_options,
                default: this.selected_printer,
                reqd: 1,
                onchange: function() {
                    let val = this.get_value();
                    localStorage.setItem('qz_default_printer', val);
                    me._fetch_printer_details(val);
                }
            },
            {
                fieldname: 'template',
                fieldtype: 'Select',
                label: __('Label Template'),
                options: template_options,
                default: this.selected_template.name,
                reqd: 1,
                onchange: function() {
                    me.selected_template = me.templates.find(t => t.name === this.get_value());
                    me._refresh_preview();
                }
            }
        ];

        if (has_items) {
            fields.push({ fieldname: 'grid_html', fieldtype: 'HTML', label: '' });
        } else {
            fields.push({
                fieldname: 'copies',
                fieldtype: 'Int',
                label: __('Copies'),
                default: 1,
                reqd: 1,
                onchange: function() {
                    me.context.no_of_copies = this.get_value();
                    me.grand_total_labels = parseInt(this.get_value()) || 1;
                    me._render_total_summary(me.grand_total_labels, 1, false);
                }
            });
        }

        fields.push({ fieldname: 'total_summary_html', fieldtype: 'HTML', label: '' });
        fields.push({ fieldtype: 'Section Break' });
        fields.push({ fieldname: 'preview_html', fieldtype: 'HTML', label: __('Preview') });

        this.dialog = new frappe.ui.Dialog({
            title: __('Print Label'),
            fields: fields,
            primary_action_label: __('Print'),
            primary_action: function(values) {
                let btn = me.dialog.get_primary_btn();
                
                if (!me.preview_ok) {
                    frappe.msgprint(__('Preview unavailable — resolve before printing.'));
                    return;
                }

                if (has_items) {
                    let selected_items = [];
                    let has_errors = false;

                    me.dialog.get_field('grid_html').$wrapper.find('.qz-item-row').each(function() {
                        let checkbox = $(this).find('.qz-item-check');
                        if (checkbox.is(':checked')) {
                            let idx = checkbox.data('idx');
                            let mode = $(this).find('.qz-print-as').val();
                            let original_item = JSON.parse(JSON.stringify(me.original_items[idx]));
                            let trans_qty = parseFloat(original_item.qty || original_item.received_qty || original_item.stock_qty || 1);

                            if (mode === 'per_item') {
                                let copies = parseInt($(this).find('.qz-row-copies').val()) || 0;
                                if (copies <= 0) {
                                    has_errors = true;
                                    return false;
                                }
                                original_item.print_qty = copies;
                                selected_items.push(original_item);
                            } else if (mode === 'per_carton') {
                                let per_carton = parseFloat($(this).find('.qz-row-carton-qty').val()) || 0;
                                if (per_carton <= 0) {
                                    has_errors = true;
                                    return false;
                                }
                                let expanded = me._expand_single_item_by_carton(original_item, per_carton, trans_qty);
                                selected_items.push(...expanded);
                            }
                        }
                    });

                    if (has_errors) {
                        frappe.msgprint(__('Please resolve validation errors in selected rows before printing.'));
                        return;
                    }

                    if (selected_items.length === 0) {
                        frappe.msgprint(__('Please select at least one item row to print.'));
                        return;
                    }

                    me.context.items = selected_items;
                }

                let threshold = 20;
                let total_to_print = me.grand_total_labels || 1;
                
                if (total_to_print > threshold) {
                    frappe.confirm(
                        __('You are about to print <b>{0} labels</b> across {1} item(s). Do you want to continue?', [total_to_print, (me.context.items ? me.context.items.length : 1)]),
                        function() {
                            me._execute_print(values, btn);
                        }
                    );
                } else {
                    me._execute_print(values, btn);
                }
            }
        });

        // Set wide dialog width for comfortable high-density grid
        this.dialog.$wrapper.find('.modal-dialog').css({
            'max-width': '1050px',
            'width': '92vw'
        });

        if (has_items) {
            this.original_items = JSON.parse(JSON.stringify(this.context.items));
            this._render_item_grid();
        } else {
            this.context.no_of_copies = 1;
            this.grand_total_labels = 1;
            this._render_total_summary(1, 1, false);
        }

        this.dialog.show();
        this._update_status_dot();
        
        if (window.qz && qz.websocket) {
            qz.websocket.setClosedCallbacks(() => {
                if (me.dialog) me._update_status_dot('red', 'Disconnected from QZ Tray');
            });
            qz.websocket.setErrorCallbacks(() => {
                if (me.dialog) me._update_status_dot('red', 'Connection Error');
            });
        }
    }

    _execute_print(values, btn) {
        let me = this;
        btn.prop('disabled', true);
        me._update_status_dot('amber', 'Sending to printer...');
        window.QZBridge.execute_print(values.printer, values.template, me.context)
            .then(() => {
                me._update_status_dot('green', 'Connected to QZ Tray');
                me.dialog.hide();
            })
            .catch(() => {
                me._update_status_dot('red', 'Print Failed');
            })
            .finally(() => {
                btn.prop('disabled', false);
            });
    }

    _expand_single_item_by_carton(item, per_carton, total_qty) {
        let expanded = [];
        let full_cartons = Math.floor(total_qty / per_carton);
        let remainder = total_qty % per_carton;
        let total_cartons = full_cartons + (remainder > 0 ? 1 : 0);

        let current_carton = 1;
        for (let i = 0; i < full_cartons; i++) {
            let new_item = JSON.parse(JSON.stringify(item));
            new_item.carton_no = current_carton;
            new_item.total_cartons = total_cartons;
            new_item.carton_qty = per_carton;
            new_item.print_qty = 1;
            new_item.qty = per_carton;
            expanded.push(new_item);
            current_carton++;
        }
        if (remainder > 0) {
            let new_item = JSON.parse(JSON.stringify(item));
            new_item.carton_no = current_carton;
            new_item.total_cartons = total_cartons;
            new_item.carton_qty = remainder;
            new_item.print_qty = 1;
            new_item.qty = remainder;
            expanded.push(new_item);
        }
        return expanded;
    }

    _update_status_dot(state, msg) {
        if (!this.dialog) return;
        
        let color = '#ff3b30'; // red
        let text = 'Disconnected';
        
        if (state) {
            color = state === 'amber' ? '#ff9500' : (state === 'green' ? '#34c759' : color);
            text = msg;
        } else if (window.qz && qz.websocket && qz.websocket.isActive()) {
            color = '#34c759'; // green
            text = 'Connected to QZ Tray';
        } else if (window.QZBridgeConnect && window.QZBridgeConnect.connecting) {
            color = '#ff9500'; // amber
            text = 'Connecting...';
        }

        let wrapper = this.dialog.get_field('status_html').$wrapper;
        wrapper.html(`
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-size: 11px; color: #718096; margin-bottom: 4px;">
                <span style="height: 8px; width: 8px; background-color: ${color}; border-radius: 50%; display: inline-block;"></span>
                <span>${text}</span>
            </div>
        `);
    }

    _render_item_grid() {
        let me = this;
        let wrapper = this.dialog.get_field('grid_html').$wrapper;

        let html = `
            <div style="max-height: 280px; overflow-y: auto; border: 1px solid #d1d8dd; border-radius: 6px; margin-bottom: 8px;">
                <table class="table table-bordered table-hover" style="margin-bottom: 0; font-size: 12px;">
                    <thead style="background-color: #f7fafc; position: sticky; top: 0; z-index: 2;">
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" class="qz-check-all" checked></th>
                            <th style="width: 130px;">Item Code</th>
                            <th>Item Name</th>
                            <th style="width: 130px;">Batch No</th>
                            <th style="width: 70px; text-align: center;">UOM</th>
                            <th style="width: 90px; text-align: right;">Trans Qty</th>
                            <th style="width: 130px;">Print As</th>
                            <th style="width: 150px;">Print Details</th>
                            <th style="min-width: 190px;">Resulting Labels</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.original_items.forEach((item, idx) => {
            let trans_qty = item.qty || item.received_qty || item.stock_qty || 1;
            let uom = item.uom || item.stock_uom || 'Pcs';
            let batch_no = item.batch_no || '-';

            html += `
                <tr class="qz-item-row" data-idx="${idx}">
                    <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="qz-item-check" data-idx="${idx}" checked></td>
                    <td style="vertical-align: middle; font-weight: 600;">${item.item_code || ''}</td>
                    <td style="vertical-align: middle;"><div class="text-truncate" style="max-width: 160px;" title="${item.item_name || ''}">${item.item_name || ''}</div></td>
                    <td style="vertical-align: middle;"><span class="badge badge-default">${batch_no}</span></td>
                    <td style="vertical-align: middle; text-align: center; color: #4a5568;">${uom}</td>
                    <td style="vertical-align: middle; text-align: right; font-weight: 600;" class="qz-trans-qty" data-qty="${trans_qty}">${trans_qty}</td>
                    <td style="vertical-align: middle;">
                        <select class="form-control input-xs qz-print-as" data-idx="${idx}">
                            <option value="per_item" selected>Per Item</option>
                            <option value="per_carton">Per Carton</option>
                        </select>
                    </td>
                    <td style="vertical-align: middle;">
                        <div class="qz-details-per-item" style="display:flex; align-items:center; gap:5px;">
                            <span style="font-size:11px; color:#718096;">Copies:</span>
                            <input type="number" class="form-control input-xs qz-row-copies" value="1" min="1" style="width:75px;">
                        </div>
                        <div class="qz-details-per-carton" style="display:none; align-items:center; gap:5px;">
                            <span style="font-size:11px; color:#718096;">Qty/Carton:</span>
                            <input type="number" class="form-control input-xs qz-row-carton-qty" placeholder="Reqd" min="1" style="width:75px;">
                        </div>
                    </td>
                    <td style="vertical-align: middle;" class="qz-row-result">
                        <span class="qz-result-text text-muted">→ 1 label</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        wrapper.html(html);

        wrapper.find('.qz-check-all').on('change', function() {
            let is_checked = $(this).is(':checked');
            wrapper.find('.qz-item-check').prop('checked', is_checked);
            me._recalculate_totals();
        });

        wrapper.find('.qz-item-check').on('change', function() {
            me._recalculate_totals();
        });

        wrapper.find('.qz-print-as').on('change', function() {
            let row = $(this).closest('tr');
            let mode = $(this).val();
            if (mode === 'per_carton') {
                row.find('.qz-details-per-item').hide();
                row.find('.qz-details-per-carton').show();
            } else {
                row.find('.qz-details-per-item').show();
                row.find('.qz-details-per-carton').hide();
            }
            me._recalculate_totals();
        });

        wrapper.find('.qz-row-copies, .qz-row-carton-qty').on('input change', function() {
            me._recalculate_totals();
        });

        me._recalculate_totals();
    }

    _recalculate_totals() {
        let me = this;
        if (!this.dialog) return;

        let grid_field = this.dialog.get_field('grid_html');
        if (!grid_field || !grid_field.$wrapper) {
            let copies = parseInt(this.dialog.get_value('copies')) || me.context.no_of_copies || 1;
            me.grand_total_labels = copies;
            me._render_total_summary(copies, 1, false);
            return;
        }

        let wrapper = grid_field.$wrapper;
        let total_labels = 0;
        let selected_count = 0;
        let has_error = false;

        wrapper.find('.qz-item-row').each(function() {
            let checkbox = $(this).find('.qz-item-check');
            let row = $(this);
            let result_cell = row.find('.qz-row-result');
            let trans_qty = parseFloat(row.find('.qz-trans-qty').data('qty')) || 1;
            let mode = row.find('.qz-print-as').val();

            row.removeClass('has-error');
            row.find('.qz-row-copies, .qz-row-carton-qty').removeClass('is-invalid').css('border-color', '');

            if (checkbox.is(':checked')) {
                selected_count++;

                if (mode === 'per_item') {
                    let copies = parseInt(row.find('.qz-row-copies').val()) || 0;
                    if (copies <= 0) {
                        has_error = true;
                        row.addClass('has-error');
                        row.find('.qz-row-copies').addClass('is-invalid').css('border-color', '#e53e3e');
                        result_cell.html('<span class="text-danger font-weight-bold">Copies must be ≥ 1</span>');
                    } else {
                        total_labels += copies;
                        result_cell.html(`<span class="text-success font-weight-bold">→ ${copies} label${copies > 1 ? 's' : ''}</span>`);
                    }
                } else if (mode === 'per_carton') {
                    let per_carton = parseFloat(row.find('.qz-row-carton-qty').val()) || 0;
                    if (per_carton <= 0) {
                        has_error = true;
                        row.addClass('has-error');
                        row.find('.qz-row-carton-qty').addClass('is-invalid').css('border-color', '#e53e3e');
                        result_cell.html('<span class="text-danger font-weight-bold">Qty per Carton is required</span>');
                    } else {
                        let carton_count = Math.ceil(trans_qty / per_carton);
                        total_labels += carton_count;
                        result_cell.html(`<span class="text-primary font-weight-bold">→ ${carton_count} carton${carton_count > 1 ? 's' : ''} (Box 1-${carton_count})</span>`);
                    }
                }
            } else {
                result_cell.html('<span class="text-muted">Row unchecked</span>');
            }
        });

        me.grand_total_labels = total_labels;
        me._render_total_summary(total_labels, selected_count, has_error);
    }

    _render_total_summary(total_labels, selected_count, has_error) {
        let me = this;
        let summary_field = this.dialog.get_field('total_summary_html');
        if (!summary_field) return;
        let summary_wrapper = summary_field.$wrapper;
        let btn = this.dialog.get_primary_btn();

        if (has_error) {
            summary_wrapper.html(`
                <div style="padding: 10px 14px; font-weight: 600; font-size: 13px; background: #fff5f5; border: 1px solid #feb2b2; color: #c53030; border-radius: 6px; margin-top: 6px;">
                    ⚠️ Please fix error(s) in selected row(s) before printing.
                </div>
            `);
            btn.prop('disabled', true);
            return;
        }

        if (selected_count === 0 && this.original_items) {
            summary_wrapper.html(`
                <div style="padding: 10px 14px; font-weight: 600; font-size: 13px; background: #edf2f7; border: 1px solid #cbd5e0; color: #4a5568; border-radius: 6px; margin-top: 6px;">
                    Please select at least one item row to print.
                </div>
            `);
            btn.prop('disabled', true);
            return;
        }

        if (!me.preview_ok) {
            summary_wrapper.html(`
                <div style="padding: 10px 14px; font-weight: 600; font-size: 13px; background: #fff5f5; border: 1px solid #feb2b2; color: #c53030; border-radius: 6px; margin-top: 6px;">
                    ⚠️ Preview unavailable — resolve preview error before printing.
                </div>
            `);
            btn.prop('disabled', true);
            return;
        }

        btn.prop('disabled', false);
        summary_wrapper.html(`
            <div style="padding: 10px 14px; font-weight: 700; font-size: 14px; background: #ebf8ff; border: 1px solid #bee3f8; color: #2b6cb0; border-radius: 6px; margin-top: 6px; display: flex; align-items: center; justify-content: space-between;">
                <span>Total: <b>${total_labels} label${total_labels !== 1 ? 's' : ''}</b> will be printed (across ${selected_count} item${selected_count !== 1 ? 's' : ''})</span>
                ${total_labels > 20 ? '<span class="badge badge-warning" style="font-size:11px; padding:4px 8px;">High Volume Job (>20)</span>' : ''}
            </div>
        `);
    }

    _refresh_preview() {
        let me = this;
        let wrapper = me.dialog.get_field('preview_html').$wrapper;
        if (!me.selected_template) return;
        
        let sample_context = JSON.parse(JSON.stringify(me.context));
        
        if (sample_context.items && sample_context.items.length > 0) {
            let first_item = JSON.parse(JSON.stringify(sample_context.items[0]));
            first_item.print_qty = 1;
            first_item.qty = first_item.qty || 1;
            sample_context.items = [first_item];
        }
        
        frappe.call({
            method: 'qzbridge.api.get_print_data',
            args: {
                template_name: me.selected_template.name,
                context_json: JSON.stringify(sample_context)
            },
            callback: function(r) {
                if (r.message && r.message.commands) {
                    let cmd = r.message.commands;
                    let tspl = Array.isArray(cmd) ? cmd : [cmd];
                    
                    me._render_preview_in_dom(wrapper[0], {
                        printer_language: me.selected_template.printer_language || 'TSPL',
                        tspl: tspl,
                        width_mm: me.selected_template.width_mm || 50,
                        height_mm: me.selected_template.height_mm || 30
                    });
                }
            }
        });
    }

    _render_preview_in_dom(container, preview_data) {
        if(preview_data.printer_language === 'ZPL') {
            this._renderZPL(container, preview_data.tspl.join('\n'), preview_data.width_mm, preview_data.height_mm);
        } else if (preview_data.printer_language === 'EPL') {
            container.innerHTML = '<div style="padding:20px;text-align:center;border:1px dashed #ccc;">EPL Preview not fully supported on client yet.</div>';
        } else {
            container.innerHTML = `<pre style="font-size:10px; background:#f5f5f5; padding:10px; max-height:120px; overflow-y:auto;">${preview_data.tspl.join('\n')}</pre>`;
        }
    }

    _renderZPL(container, zpl, width_mm, height_mm) {
        let me = this;
        if (!zpl || zpl.trim() === '') {
            container.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">No printable commands generated. Check your template variables.</div>';
            me.preview_ok = false;
            me._recalculate_totals();
            return;
        }
        
        let first_label_zpl = zpl;
        let xa_idx = zpl.indexOf('^XA');
        let xz_idx = zpl.indexOf('^XZ', xa_idx);
        if (xa_idx !== -1 && xz_idx !== -1) {
            first_label_zpl = zpl.substring(xa_idx, xz_idx + 3);
        }

        let width_inch = parseFloat((width_mm / 25.4).toFixed(2));
        let height_inch = parseFloat((height_mm / 25.4).toFixed(2));
        
        let dpi = 203;
        let pw_match = first_label_zpl.match(/\^PW(\d+)/);
        if (pw_match && pw_match[1] && width_inch > 0) {
            let pw_dots = parseInt(pw_match[1]);
            dpi = Math.round(pw_dots / width_inch);
        } else if (this.context.printer && this.context.printer.dpi) {
            dpi = parseInt(this.context.printer.dpi) || 203;
        }
        
        let dpmm = "8dpmm";
        if (dpi >= 550) dpmm = "24dpmm";
        else if (dpi >= 280) dpmm = "12dpmm";
        
        let url = `https://api.labelary.com/v1/printers/${dpmm}/labels/${width_inch}x${height_inch}/0/`;
        
        container.innerHTML = '<div class="text-muted text-center" style="padding: 15px;">Fetching live preview from Labelary...</div>';
        
        fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'image/png',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: first_label_zpl
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Labelary API returned status ' + response.status);
            }
            return response.blob();
        })
        .then(blob => {
            let img_url = URL.createObjectURL(blob);
            container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:10px;">
                <img src="${img_url}" style="max-height:160px; max-width:100%; border:1px solid #cbd5e0; border-radius:4px; box-shadow:0px 4px 10px rgba(0,0,0,0.1);">
            </div>`;
            me.preview_ok = true;
            me._recalculate_totals();
        })
        .catch(err => {
            container.innerHTML = `<div class='text-danger text-center p-3'>Preview unavailable (${err.message}). Resolve preview before printing.</div>`;
            me.preview_ok = false;
            me._recalculate_totals();
        });
    }
};
