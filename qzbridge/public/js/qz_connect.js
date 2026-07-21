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
    
    getPrinters: function() {
        return this.init().then(() => qz.printers.find());
    }
};
