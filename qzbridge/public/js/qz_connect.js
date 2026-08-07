window.QZBridgeConnect = {
    connected: false,
    connecting: false,
    qz_version: '2.1.2',

    init: function() {
        if (this.connected || this.connecting) return Promise.resolve();
        this.connecting = true;

        return this._loadDependencies()
            .then(() => this._setupSecurity())
            .then(() => this._connect())
            .then(() => {
                this.connected = true;
                this.connecting = false;
                console.log("QZBridge: Successfully connected to QZ Tray.");
            })
            .catch(err => {
                this.connecting = false;
                console.error("QZBridge Connection Error:", err);
                frappe.msgprint({
                    title: __('Printer Connection Error'),
                    indicator: 'red',
                    message: __('Could not connect to QZ Tray. Ensure QZ Tray is running locally.')
                });
                throw err;
            });
    },

    _loadDependencies: function() {
        return new Promise((resolve, reject) => {
            if (window.qz) return resolve();

            // Load jsrsasign and QZ Tray dependencies via CDN
            const loadScript = (url) => {
                return new Promise((res, rej) => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.onload = res;
                    script.onerror = rej;
                    document.head.appendChild(script);
                });
            };

            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/8.0.20/jsrsasign-all-min.js')
                .then(() => loadScript(`https://cdn.rawgit.com/qzind/tray/v${this.qz_version}/js/qz-tray.js`))
                .then(resolve)
                .catch(reject);
        });
    },

    _setupSecurity: function() {
        return new Promise((resolve) => {
            qz.security.setCertificatePromise(function(resolveCert, rejectCert) {
                frappe.call({
                    method: 'qzbridge.qz_auth.get_qz_certificate',
                    callback: function(r) {
                        if(r.message) resolveCert(r.message);
                        else rejectCert();
                    }
                });
            });

            qz.security.setSignatureAlgorithm("SHA512");
            qz.security.setSignaturePromise(function(toSign) {
                return function(resolveSig, rejectSig) {
                    frappe.call({
                        method: 'qzbridge.qz_auth.sign_qz_message',
                        args: { challenge: toSign },
                        callback: function(r) {
                            if(r.message) resolveSig(r.message);
                            else rejectSig();
                        }
                    });
                };
            });
            resolve();
        });
    },

    _connect: function() {
        return qz.websocket.connect({ retries: 2, delay: 1 });
    },
    
    getActivePrinters: function() {
        return this.init().then(() => {
            return qz.printers.find().then(printers => {
                if (!Array.isArray(printers) || printers.length === 0) return [];
                
                let isVirtual = (name) => {
                    let n = (name || '').toLowerCase();
                    return n.includes('pdf') || n.includes('onenote') || n.includes('anydesk') || 
                           n.includes('fax') || n.includes('redirected') || n.includes('xps');
                };

                let activePrinters = printers.filter(p => !isVirtual(p));
                return activePrinters.length > 0 ? activePrinters : printers;
            }).catch(() => []);
        });
    },

    getPrinters: function() {
        return this.getActivePrinters();
    },
    
    getPrinterDetails: function(printer) {
        return this.init().then(() => qz.printers.details(printer)).then(details => {
            console.log("Printer Details for " + printer + ":", details);
            return details;
        });
    }
};
