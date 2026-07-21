// Copyright (c) 2026, Somil and contributors
// For license information, please see license.txt

frappe.ui.form.on("Label Template", {
	refresh(frm) {
        frm.trigger('render_preview');
	},
    raw_code(frm) {
        frm.trigger('render_preview');
    },
    width_mm(frm) {
        frm.trigger('render_preview');
    },
    height_mm(frm) {
        frm.trigger('render_preview');
    },
    printer_language(frm) {
        frm.trigger('render_preview');
    },
    render_preview: frappe.utils.debounce(function(frm) {
        let wrapper = frm.get_field('preview_html').$wrapper;
        
        if (!frm.doc.raw_code) {
            wrapper.html('<div class="text-muted text-center" style="padding: 20px; border: 1px dashed #ccc;">Enter raw code to see preview.</div>');
            return;
        }

        if (frm.doc.printer_language !== 'ZPL') {
            wrapper.html('<div class="text-muted text-center" style="padding: 20px; border: 1px dashed #ccc;">Live preview is currently only supported for ZPL.</div>');
            return;
        }

        wrapper.html('<div class="text-muted text-center" style="padding: 20px;">Fetching preview...</div>');

        // Replace jinja tags with dummy text or numbers for preview purposes
        let safe_zpl = frm.doc.raw_code
            .replace(/\{\{(.*?)\}\}/g, function(match, p1) {
                // If the jinja block contains a number (like scaling math), use the first number
                // so that ZPL coordinates don't break (e.g. ^FO50,50 instead of ^FOPREVIEW,PREVIEW)
                let num_match = p1.match(/\b\d+\b/);
                if (num_match) {
                    return num_match[0];
                }
                return 'PREVIEW';
            })
            .replace(/\{%.*?%\}/g, ''); // Remove jinja logic blocks

        let width_inch = (frm.doc.width_mm / 25.4).toFixed(2);
        let height_inch = (frm.doc.height_mm / 25.4).toFixed(2);
        let url = `http://api.labelary.com/v1/printers/8dpmm/labels/${width_inch}x${height_inch}/0/`;

        fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'image/png',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: safe_zpl
        })
        .then(response => {
            if (!response.ok) throw new Error('API Error');
            return response.blob();
        })
        .then(blob => {
            let img_url = URL.createObjectURL(blob);
            wrapper.html(`
                <div style="display:flex;align-items:center;justify-content:center;padding:10px;background:#f5f6f8;border-radius:4px;">
                    <img src="${img_url}" style="max-width:100%; border:1px solid #d1d8dd; box-shadow:0px 4px 10px rgba(0,0,0,0.1);">
                </div>
            `);
        })
        .catch(err => {
            wrapper.html(`<div class='text-danger text-center' style="padding: 20px; border: 1px dashed #ccc;">Preview Error: Could not load image from Labelary. Ensure your ZPL is valid.</div>`);
        });
    }, 500)
});
