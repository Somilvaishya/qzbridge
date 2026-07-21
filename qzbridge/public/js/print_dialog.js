window.QZPrintDialog = class QZPrintDialog {
    constructor(templates, context) {
        this.templates = templates;
        this.context = context || {};
        this.printers = [];
        this.selected_printer = localStorage.getItem('qz_default_printer') || '';
        this.selected_template = templates[0];
    }

    show() {
        let me = this;
        window.QZBridgeConnect.getPrinters().then(printers => {
            me.printers = printers;
            if (!me.selected_printer && printers.length > 0) {
                me.selected_printer = printers[0];
            }
            me._build_dialog();
        });
    }

    _build_dialog() {
        let me = this;
        
        let printer_options = this.printers.map(p => ({ label: p, value: p }));
        let template_options = this.templates.map(t => ({ label: t.template_name, value: t.name }));
        
        let has_items = this.context.items && this.context.items.length > 0;
        
        let fields = [
            {
                fieldname: 'printer',
                fieldtype: 'Select',
                label: __('Select Printer'),
                options: printer_options,
                default: this.selected_printer,
                reqd: 1,
                onchange: function() {
                    localStorage.setItem('qz_default_printer', this.get_value());
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
            fields.push({
                fieldname: 'tabs_html',
                fieldtype: 'HTML',
                label: ''
            });
        } else {
            fields.push({
                fieldname: 'copies',
                fieldtype: 'Int',
                label: __('No. of Copies'),
                default: 1,
                reqd: 1,
                onchange: function() {
                    me.context.no_of_copies = this.get_value();
                }
            });
        }

        fields.push({ fieldtype: 'Section Break' });
        fields.push({ fieldname: 'preview_html', fieldtype: 'HTML', label: __('Preview') });
        
        this.dialog = new frappe.ui.Dialog({
            title: __('Print Label'),
            fields: fields,
            primary_action_label: __('Print'),
            primary_action: function(values) {
                let btn = me.dialog.get_primary_btn();
                btn.prop('disabled', true);
                
                // If we have an item grid, filter items based on DOM state
                if (has_items) {
                    let selected_items = [];
                    let grid_selector = me.active_tab === 'carton-tab' ? '#carton' : '#standard';
                    let grid_wrapper = me.dialog.get_field('tabs_html').$wrapper.find(grid_selector);
                    let source_items = me.active_tab === 'carton-tab' ? me.carton_items : me.original_items;
                    
                    if (me.active_tab === 'carton-tab' && (!me.carton_items || me.carton_items.length === 0)) {
                        frappe.msgprint(__('Please generate cartons first.'));
                        btn.prop('disabled', false);
                        return;
                    }
                    
                    grid_wrapper.find('.qz-item-row').each(function() {
                        let checkbox = $(this).find('.qz-item-check');
                        if (checkbox.is(':checked')) {
                            let idx = checkbox.data('idx');
                            let qty = $(this).find('.qz-item-qty').val();
                            
                            let original_item = source_items[idx];
                            original_item.print_qty = parseInt(qty) || 1;
                            selected_items.push(original_item);
                        }
                    });
                    
                    if (selected_items.length === 0) {
                        frappe.msgprint(__('Please select at least one item to print.'));
                        btn.prop('disabled', false);
                        return;
                    }
                    
                    me.context.items = selected_items;
                }
                
                window.QZBridge.execute_print(values.printer, values.template, me.context)
                    .then(() => {
                        me.dialog.hide();
                    })
                    .finally(() => {
                        btn.prop('disabled', false);
                    });
            }
        });

        if (has_items) {
            this.original_items = JSON.parse(JSON.stringify(this.context.items));
            this.carton_items = [];
            this.active_tab = 'standard-tab';
            this._render_item_grid();
        } else {
            this.context.no_of_copies = 1;
        }
        
        this._refresh_preview();
        this.dialog.show();
    }

    _render_item_grid() {
        let me = this;
        let wrapper = this.dialog.get_field('tabs_html').$wrapper;
        
        let html = `
            <ul class="nav nav-tabs" id="qz-print-tabs" role="tablist" style="margin-bottom: 10px;">
                <li class="nav-item">
                    <a class="nav-link active" id="standard-tab" data-toggle="tab" data-target="#standard" role="tab" style="cursor:pointer">Standard Labels</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" id="carton-tab" data-toggle="tab" data-target="#carton" role="tab" style="cursor:pointer">Carton Labels</a>
                </li>
            </ul>
            <div class="tab-content">
                <div class="tab-pane active" id="standard" role="tabpanel">
                    ${this._get_standard_grid_html()}
                </div>
                <div class="tab-pane" id="carton" role="tabpanel">
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <input type="number" id="qz-carton-qty" class="form-control" placeholder="Qty per Carton" style="max-width: 150px;">
                        <button class="btn btn-default btn-sm" id="qz-generate-cartons">Generate</button>
                    </div>
                    <div id="qz-carton-grid-wrapper">
                        <div class="text-muted" style="padding: 20px; text-align: center; border: 1px dashed #d1d8dd; border-radius: 4px;">Enter items per carton and click Generate.</div>
                    </div>
                </div>
            </div>
        `;
        
        wrapper.html(html);
        
        // Standard Grid Check All
        wrapper.find('#standard .qz-check-all').on('change', function() {
            let is_checked = $(this).is(':checked');
            wrapper.find('#standard .qz-item-check').prop('checked', is_checked);
        });

        // Tab Switching
        wrapper.find('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
            me.active_tab = $(e.target).attr('id');
        });

        // Generate Cartons
        wrapper.find('#qz-generate-cartons').on('click', function() {
            let qty = wrapper.find('#qz-carton-qty').val();
            if(!qty || qty <= 0) {
                frappe.msgprint(__('Please enter a valid carton quantity.'));
                return;
            }
            
            $(this).prop('disabled', true).text('Generating...');
            let btn = $(this);
            
            frappe.call({
                method: 'qzbridge.api.generate_carton_data',
                args: {
                    items_json: JSON.stringify(me.original_items),
                    qty_per_carton: qty
                },
                callback: function(r) {
                    btn.prop('disabled', false).text('Generate');
                    if (r.message) {
                        me.carton_items = r.message;
                        wrapper.find('#qz-carton-grid-wrapper').html(me._get_carton_grid_html(me.carton_items));
                        
                        wrapper.find('#carton .qz-check-all').on('change', function() {
                            let is_checked = $(this).is(':checked');
                            wrapper.find('#carton .qz-item-check').prop('checked', is_checked);
                        });
                    }
                }
            });
        });
    }

    _get_standard_grid_html() {
        let html = `
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #d1d8dd; border-radius: 4px;">
                <table class="table table-bordered table-hover" style="margin-bottom: 0;">
                    <thead style="background-color: #f7fafc; position: sticky; top: 0; z-index: 1;">
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" class="qz-check-all" checked></th>
                            <th>Item Code</th>
                            <th>Item Name</th>
                            <th style="width: 100px;">Qty to Print</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        this.original_items.forEach((item, idx) => {
            let default_qty = item.qty || item.received_qty || item.stock_qty || 1;
            html += `
                <tr class="qz-item-row">
                    <td style="text-align: center;"><input type="checkbox" class="qz-item-check" data-idx="${idx}" checked></td>
                    <td>${item.item_code || ''}</td>
                    <td><div class="text-truncate" style="max-width: 150px;" title="${item.item_name || ''}">${item.item_name || ''}</div></td>
                    <td><input type="number" class="form-control input-xs qz-item-qty" value="${default_qty}" min="1"></td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        return html;
    }

    _get_carton_grid_html(carton_items) {
        let html = `
            <div style="max-height: 160px; overflow-y: auto; border: 1px solid #d1d8dd; border-radius: 4px;">
                <table class="table table-bordered table-hover" style="margin-bottom: 0;">
                    <thead style="background-color: #f7fafc; position: sticky; top: 0; z-index: 1;">
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" class="qz-check-all" checked></th>
                            <th>Item Code</th>
                            <th>Box Info</th>
                            <th style="width: 100px;">Copies</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        carton_items.forEach((item, idx) => {
            html += `
                <tr class="qz-item-row">
                    <td style="text-align: center;"><input type="checkbox" class="qz-item-check" data-idx="${idx}" checked></td>
                    <td>${item.item_code || ''}</td>
                    <td>Box ${item.carton_no}/${item.total_cartons} (Qty: ${item.carton_qty})</td>
                    <td><input type="number" class="form-control input-xs qz-item-qty" value="1" min="1"></td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        return html;
    }

    _refresh_preview() {
        let me = this;
        let wrapper = this.dialog.get_field('preview_html').$wrapper;
        wrapper.html('<div class="text-muted text-center" style="padding: 20px;">Generating preview...</div>');
        
        frappe.call({
            method: 'qzbridge.engine.preview',
            args: {
                template_name: this.selected_template.name,
                context: this.context
            },
            callback: function(r) {
                if(r.message) {
                    me._render_preview_in_dom(wrapper[0], r.message);
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
            // TSPL text preview
            container.innerHTML = `<pre style="font-size:10px; background:#f5f5f5; padding:10px;">${preview_data.tspl.join('\n')}</pre>`;
        }
    }

    _renderZPL(container, zpl, width_mm, height_mm) {
        if (!zpl || zpl.trim() === '') {
            container.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">No printable commands generated. Check your template variables.</div>';
            return;
        }
        
        let width_inch = (width_mm / 25.4).toFixed(2);
        let height_inch = (height_mm / 25.4).toFixed(2);
        let url = `http://api.labelary.com/v1/printers/8dpmm/labels/${width_inch}x${height_inch}/0/`;
        
        container.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">Fetching image from Labelary...</div>';
        
        fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'image/png',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: zpl
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Labelary API returned status ' + response.status);
            }
            return response.blob();
        })
        .then(blob => {
            let img_url = URL.createObjectURL(blob);
            container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">
                <img src="${img_url}" style="max-width:100%; border:1px solid #ccc; box-shadow:0px 4px 10px rgba(0,0,0,0.1);">
            </div>`;
        })
        .catch(err => {
            container.innerHTML = `<div class='text-danger text-center p-3'>Error loading ZPL preview: ${err.message}</div>`;
        });
    }
};
