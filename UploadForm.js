/*!
 * UploadForm
 * file upload via xhr2 (formdata) and iframe fallback
 * supports timeout, abort, setData, setHeader, callbacks incl. beforeSend
 * heads-up: iframe responses need content-type: text/plain
 *
 * JSON polyfill: http://bestiejs.github.io/json3/
 *
 * author: Stefan Benicke <stefan.benicke@gmail.com>
 */
(function (global, undefined) {

    var tryParseXML, XBrowserEvent;

    var isXHRLevel2 = (function () {
        var xhr = new XMLHttpRequest();
        var result = Boolean('upload' in xhr && 'withCredentials' in xhr && 'FormData' in global);
        xhr = null;
        return result;
    })();

    var defaults = {
        timeout: 0,
        iframe: !isXHRLevel2,
        headers: {},
        data: {},
        type: '',
        xhrCredentials: false,
        crossDomain: false
    };

    function UploadForm(formID, url, options) {
        this.form = document.getElementById(formID);
        this.url = url;
        this.options = extend({}, defaults);
        if (typeof options === 'object' && options !== null) {
            extend(this.options, options);
        }
        this.helpers = {
            xhr: undefined,
            timer: undefined,
            formHandler: undefined,
            iframeHandler: undefined,
            messageHandler: undefined
        };
        this.status = undefined;
        this.response = undefined;
        this.useIFrameFallback = !isXHRLevel2;
        this.busy = false;
        this.headers = {
            'X-Requested-With': (isXHRLevel2 ? 'XMLHttpRequest' : 'IFrame')
        };
        this.data = {};
        this.listener = {
            'beforesend': [],
            'progress': [],
            'load': [],
            'error': []
        };
        this.helpers.formHandler = XBrowserEvent.add(this.form, 'submit', bind(onSubmitForm, this));
        updateFields.call(this);
    }

    UploadForm.useIFrameFallback = !isXHRLevel2;

    UploadForm.prototype.onbeforesend = noop;
    UploadForm.prototype.onprogress = noop;
    UploadForm.prototype.onload = noop;
    UploadForm.prototype.onerror = noop;

    UploadForm.prototype.on = function on(type, callback) {
        if (typeof callback === 'function' && type in this.listener) {
            this.listener[type].push(callback);
        }
        return this;
    };

    UploadForm.prototype.off = function off(type, callback) {
        var i, n, callbacks, found;
        if (arguments.length === 0) {
            this.listener.beforesend.length = 0;
            this.listener.progress.length = 0;
            this.listener.load.length = 0;
            this.listener.error.length = 0;
        } else if (typeof callback === 'undefined' && type in this.listener && this.listener[type].length > 0) {
            this.listener[type].length = 0;
        } else if (typeof callback === 'function' && type in this.listener && this.listener[type].length > 0) {
            callbacks = [];
            found = false;
            for (i = 0, n = this.listener[type].length; i < n; ++i) {
                if (this.listener[type] === callback) {
                    found = true;
                } else {
                    callbacks.push(this.listener[type]);
                }
            }
            if (found === true) {
                this.listener[type] = callbacks;
            }
        }
        return this;
    };

    UploadForm.prototype.send = function send(options) {
        if (this.busy === true) {
            warn('UploadForm already sent.');
            return this;
        }
        this.busy = true;
        if (typeof options === 'object' && options !== null) {
            extend(this.options, options);
        }
        updateFields.call(this);
        this.status = undefined;
        this.response = undefined;
        if (!isXHRLevel2 || this.options.iframe === true) {
            doIframeUpload.call(this);
        } else {
            doAjaxUpload.call(this);
        }
        return this;
    };

    UploadForm.prototype.abort = function abort() {
        if (this.busy !== true) {
            warn('Nothing to abort.');
            return this;
        }
        if (!isXHRLevel2 || this.options.iframe === true) {
            onIframeAbort.call(this);
        } else if (this.helpers.xhr && 'abort' in this.helpers.xhr) {
            this.helpers.xhr.abort();
        }
        return this;
    };

    UploadForm.prototype.unbindFormSubmit = function unbindFormSubmit() {
        if (this.form && this.helpers.formHandler) {
            XBrowserEvent.remove(this.form, 'submit', this.helpers.formHandler);
            this.helpers.formHandler = undefined;
        }
        return this;
    };

    UploadForm.prototype.destruct = function destruct() {
        if (this.busy === true) {
            warn('Destruct failed. UploadForm currently in use.');
            return this;
        }
        this.unbindFormSubmit();
        clearTimer.call(this);
        this.form = undefined;
        this.helpers.xhr = undefined;
        this.helpers.iframeHandler = undefined;
        this.helpers.messageHandler = undefined;
        this.onbeforesend = undefined;
        this.onprogress = undefined;
        this.onload = undefined;
        this.onerror = undefined;
        this.off();
        return this;
    };

    UploadForm.prototype.setData = function setData(name, value) {
        if (name === undefined || name === null || ('' + name) === '') {
            warn('Append data failed: invalid name');
            return this;
        }
        name += '';
        value += '';
        this.data[name] = value;
        return this;
    };

    UploadForm.prototype.setHeader = function setHeader(name, value) {
        if (name === undefined || name === null || ('' + name) === '') {
            warn('Append header failed: invalid name');
            return;
        }
        name += '';
        value += '';
        this.headers[name] = value;
    };

    function updateFields() {
        var name;
        for (name in this.options.headers) {
            if (this.options.headers.hasOwnProperty(name)) {
                this.setHeader(name, this.options.headers[name]);
            }
        }
        for (name in this.options.data) {
            if (this.options.data.hasOwnProperty(name)) {
                this.setData(name, this.options.data[name]);
            }
        }
    }

    function onSubmitForm(event) {
        event = event || global.event; // old IE
        event.preventDefault ? event.preventDefault() : event.returnValue = false;
        UploadForm.prototype.send.call(this);
        return false;
    }

    function doAjaxUpload() {
        var fd, name, xhr;
        fd = new FormData(this.form);
        for (name in this.data) {
            if (this.data.hasOwnProperty(name)) {
                fd.append(name, this.data[name]);
            }
        }
        xhr = new XMLHttpRequest();
        xhr.open('POST', this.url, true);
        if (this.options.timeout > 0) {
            xhr.timeout = this.options.timeout;
        }
        for (name in this.headers) {
            if (this.headers.hasOwnProperty(name)) {
                try {
                    xhr.setRequestHeader(name, this.headers[name]);
                } catch (exception) {
                    warn(exception.message);
                }
            }
        }
        if (!('Accept' in this.headers)) {
            if (this.options.type === '' || this.options.type === 'text') {
                xhr.setRequestHeader('Accept', 'text/plain, */*; q=0.01');
            } else if (this.options.type === 'json') {
                xhr.setRequestHeader('Accept', 'application/json, text/javascript, */*; q=0.01');
            } else if (this.options.type === 'xml') {
                xhr.setRequestHeader('Accept', 'application/xml, text/xml, */*; q=0.01');
            }
        }
        if (this.options.xhrCredentials === true) {
            xhr.withCredentials = true;
        }
        XBrowserEvent.add(xhr.upload, 'progress', bind(onUploadProgress, this));
        XBrowserEvent.add(xhr, 'progress', bind(onUploadProgress, this));
        XBrowserEvent.add(xhr, 'load', bind(onUploadSuccess, this));
        XBrowserEvent.add(xhr, 'abort', bind(onUploadAbort, this));
        XBrowserEvent.add(xhr, 'error', bind(onUploadFailed, this));
        XBrowserEvent.add(xhr, 'timeout', bind(onUploadTimeout, this));
        this.helpers.xhr = xhr;
        applyEvent(this, 'beforesend');
        xhr.send(fd);
    }

    function onUploadProgress(event) {
        var type = Object.prototype.toString.call(event.target) === '[object XMLHttpRequestUpload]' ? 'upload' : 'download';
        applyEvent(this, 'progress', null, null, [type, event]);
    }

    function onUploadSuccess(event) {
        var xhr, response;
        xhr = event.target;
        this.helpers.xhr = undefined;
        this.busy = false;
        if (xhr.status !== 200) {
            return onUploadFailed.apply(this, arguments);
        }
        if (this.options.type === 'xml') {
            if (xhr.responseXML !== null) {
                response = xhr.responseXML;
            } else {
                try {
                    response = tryParseXML(xhr.responseText);
                } catch (exception) {
                    applyEvent(this, 'error', 'parseerror', '', ['parseerror', exception.message, xhr.responseText, xhr]);
                    return;
                }
            }
        } else {
            response = xhr.responseText;
            if (this.options.type === 'json') {
                try {
                    response = JSON.parse(response);
                } catch (exception) {
                    applyEvent(this, 'error', 'parseerror', '', ['parseerror', exception.message, xhr.responseText, xhr]);
                    return;
                }
            }
        }
        applyEvent(this, 'load', 'success', response, [response, xhr]);
    }

    function onUploadFailed(event) {
        var xhr = event.target;
        this.helpers.xhr = undefined;
        this.busy = false;
        applyEvent(this, 'error', 'error', '', ['error', xhr.statusText, xhr]);
    }

    function onUploadAbort(event) {
        var xhr = event.target;
        this.helpers.xhr = undefined;
        this.busy = false;
        applyEvent(this, 'error', 'abort', '', ['abort', xhr]);
    }

    function onUploadTimeout() {
        var xhr = event.target;
        this.helpers.xhr = undefined;
        this.busy = false;
        applyEvent(this, 'error', 'timeout', '', ['timeout', xhr]);
    }

    function doIframeUpload() {
        initIframeUploadForm.call(this);
        applyEvent(this, 'beforesend');
        this.form.submit();
        if (this.options.timeout > 0) {
            clearTimer.call(this);
            this.helpers.timer = setTimeout(bind(onIframeTimeout, this), this.options.timeout);
        }
    }

    function initIframeUploadForm() {
        var id, iframe, name;
        id = 'upload-iframe-' + getRandomId();
        iframe = document.createElement('iframe');
        iframe.setAttribute('src', 'javascript:false;');
        iframe.setAttribute('name', id);
        iframe.setAttribute('id', id);
        iframe.setAttribute('width', 0);
        iframe.setAttribute('height', 0);
        iframe.setAttribute('frameborder', 0);
        document.body.appendChild(iframe);
        iframe.style.display = 'none';
        if (window.frames) { // old IE
            window.frames[id].name = id;
        }
        if (this.options.crossDomain === true) {
            this.helpers.messageHandler = XBrowserEvent.add(global, 'message', bind(onCrossDomainIframeMessage, this));
        } else {
            this.helpers.iframeHandler = XBrowserEvent.add(iframe, 'load', bind(onIframeContentLoaded, this));
        }
        this.form.setAttribute('action', this.url);
        this.form.setAttribute('method', 'POST');
        this.form.setAttribute('enctype', 'multipart/form-data');
        this.form.setAttribute('encoding', 'multipart/form-data'); // old IE
        this.form.setAttribute('target', id);
        for (name in this.headers) {
            if (this.headers.hasOwnProperty(name)) {
                appendFormField.call(this, id, name, this.headers[name]);
            }
        }
        for (name in this.data) {
            if (this.data.hasOwnProperty(name)) {
                appendFormField.call(this, id, name, this.data[name]);
            }
        }
    }

    function onIframeContentLoaded() {
        var iframe, error, doc, body, response;
        clearTimer.call(this);
        iframe = document.getElementById(this.form.target);
        error = false;
        try {
            doc = iframe.contentWindow ? iframe.contentWindow.document : (iframe.contentDocument ? iframe.contentDocument : iframe.document);
            body = doc.documentElement ? doc.documentElement : doc.body;
            response = body.textContent || body.innerText;
        } catch (exception) {
            error = exception.message;
        }
        doc = null;
        body = null;
        clearIframe.call(this);
        this.busy = false;
        if (error !== false) {
            applyEvent(this, 'error', 'error', '', ['error', error]);
        } else {
            if (this.options.type === 'xml') {
                try {
                    response = tryParseXML(response);
                } catch (exception) {
                    applyEvent(this, 'error', 'parseerror', '', ['parseerror', exception.message, response]);
                    return;
                }
            } else {
                if (this.options.type === 'json') {
                    try {
                        response = JSON.parse(response);
                    } catch (exception) {
                        applyEvent(this, 'error', 'parseerror', '', ['parseerror', exception.message, response]);
                        return;
                    }
                }
            }
            applyEvent(this, 'load', 'success', response, [response]);
        }
    }

    function onCrossDomainIframeMessage(event) {
        var response;
        clearTimer.call(this);
        clearIframe.call(this);
        this.busy = false;
        event = event || global.event; // old IE
        response = event.data;
        if (this.options.type === 'xml') {
            try {
                response = tryParseXML(response);
            } catch (exception) {
                applyEvent(this, 'error', 'parseerror', '', ['parseerror', exception.message, response]);
                return;
            }
        } else {
            if (this.options.type === 'json') {
                try {
                    if (Object.prototype.toString.call(response) === '[object String]') {
                        response = JSON.parse(response);
                    }
                } catch (exception) {
                    applyEvent(this, 'error', 'parseerror', '', ['parseerror', exception.message, response]);
                    return;
                }
            }
        }
        applyEvent(this, 'load', 'success', response, [response]);
    }

    function appendFormField(id, name, value) {
        var field = document.createElement('input');
        field.setAttribute('type', 'hidden');
        field.setAttribute('data-uploadformid', id);
        field.setAttribute('name', name);
        field.setAttribute('value', value);
        this.form.appendChild(field);
    }

    function onIframeAbort() {
        clearTimer.call(this);
        clearIframe.call(this);
        this.busy = false;
        applyEvent(this, 'error', 'abort', '', ['abort']);
    }

    function onIframeTimeout() {
        this.helpers.timer = undefined;
        clearIframe.call(this);
        this.busy = false;
        applyEvent(this, 'error', 'timeout', '', ['timeout']);
    }

    function clearIframe() {
        var iframe, targetId, formFields, i, uploadFormId;
        iframe = document.getElementById(this.form.target);
        XBrowserEvent.remove(iframe, 'load', this.helpers.iframeHandler);
        this.helpers.iframeHandler = undefined;
        if (this.options.crossDomain === true && this.helpers.messageHandler) {
            XBrowserEvent.remove(global, 'message', this.helpers.messageHandler);
            this.helpers.messageHandler = undefined;
        }
        targetId = this.form.getAttribute('target');
        this.form.removeAttribute('action');
        this.form.removeAttribute('method');
        this.form.removeAttribute('enctype');
        this.form.removeAttribute('encoding');
        this.form.removeAttribute('target');
        document.body.removeChild(iframe);
        iframe = null;
        formFields = this.form.getElementsByTagName('input');
        for (i = 0; i < formFields.length; ++i) {
            if (formFields[i].type !== 'hidden') {
                continue;
            }
            uploadFormId = formFields[i].getAttribute('data-uploadformid');
            if (uploadFormId === targetId) {
                this.form.removeChild(formFields[i]);
                --i;
            }
        }
        formFields = null;
    }

    function clearTimer() {
        if (typeof this.helpers.timer !== 'undefined') {
            clearTimeout(this.helpers.timer);
            this.helpers.timer = undefined;
        }
    }

    global.UploadForm = UploadForm;

    function applyEvent(instance, event, status, response, args) {
        var i, n;
        if (status !== null && status !== undefined && response !== null && response !== undefined) {
            instance.status = status;
            instance.response = response;
        }
        if (args === undefined) {
            instance['on' + event]();
            for (i = 0, n = instance.listener[event].length; i < n; ++i) {
                instance.listener[event][i].call(instance);
            }
        } else {
            instance['on' + event].apply(instance, args);
            for (i = 0, n = instance.listener[event].length; i < n; ++i) {
                instance.listener[event][i].apply(instance, args);
            }
        }
    }

    function bind(callback, reference, args) {
        return function cb() {
            var i, n, argsLength;
            if (typeof args !== 'undefined' && typeof args === 'object' && 'length' in args) {
                argsLength = args.length;
                args.length += arguments.length;
                for (i = 0, n = arguments.length; i < n; ++i) {
                    args[i + argsLength] = arguments[i];
                }
                return callback.apply(reference, args);
            }
            return callback.apply(reference, arguments);
        }
    }

    function noop() {
    }

    function getRandomId() {
        return Math.round(Math.random() * 10000000);
    }

    function extend(destination, source) {
        var k;
        for (k in source) {
            if (source.hasOwnProperty(k)) {
                destination[k] = source[k];
            }
        }
        return destination;
    }

    function warn(message) {
        typeof console === 'object' && 'warn' in console && typeof console.warn === 'function' && console.warn(message);
    }

    /* inspired by https://gist.github.com/1129031 */
    /*global document, DOMParser*/
    (function (DOMParser) {
        'use strict';

        var proto = DOMParser.prototype;
        var nativeParse = proto.parseFromString;

        // Firefox/Opera/IE throw errors on unsupported types
        try {
            // WebKit returns null on unsupported types
            if ((new DOMParser()).parseFromString('', 'text/html')) {
                // text/html parsing is natively supported
                return;
            }
        } catch (ex) {
        }

        proto.parseFromString = function (markup, type) {
            if (/^\s*text\/html\s*(?:;|$)/i.test(type)) {
                var doc = document.implementation.createHTMLDocument('');
                if (markup.toLowerCase().indexOf('<!doctype') > -1) {
                    doc.documentElement.innerHTML = markup;
                } else {
                    doc.body.innerHTML = markup;
                }
                return doc;
            } else {
                return nativeParse.apply(this, arguments);
            }
        };
    }(DOMParser));

    tryParseXML = (function () {

        var parsererrorNS = new DOMParser().parseFromString('INVALID', 'text/xml').getElementsByTagName('parsererror')[0].namespaceURI;

        return function tryParseXML(xmlString) {
            var dom = new DOMParser().parseFromString(xmlString, 'text/xml');
            if (dom.getElementsByTagNameNS(parsererrorNS, 'parsererror').length > 0) {
                throw new Error('Error parsing XML');
            }
            return dom;
        }

    })();

    /*
     * based on https://gist.github.com/eduardocereto/955642
     */
    XBrowserEvent = (function (undefined) {

        var _interface = {};

        if (document.addEventListener) {
            _interface.add = function (element, type, handler, useCapture) {
                element.addEventListener(type, handler, !!useCapture);
                return handler;
            };
            _interface.remove = function (element, type, handler, useCapture) {
                element.removeEventListener(type, handler, !!useCapture);
                return true;
            };
        } else if (document.attachEvent) {
            _interface.add = function (element, type, handler) {
                var boundedHandler;
                type = 'on' + type;
                boundedHandler = function () {
                    return handler.apply(element, arguments);
                };
                element.attachEvent(type, boundedHandler);
                return boundedHandler;
            };
            _interface.remove = function (element, type, handler) {
                type = 'on' + type;
                element.detachEvent(type, handler);
                return true;
            };
        } else {
            _interface.add = function (element, type, handler) {
                var memorize, id;
                type = 'on' + type;
                element.memorize = element.memorize || {};
                if (!element.memorize[type]) {
                    if (typeof element[type] == 'function') {
                        element.memorize[type] = {
                            id: 1,
                            handler: {
                                'func1': element[type]
                            }
                        };
                    } else {
                        element.memorize[type] = {id: 0, handler: {}};
                    }
                    element[type] = function () {
                        var handlerID;
                        for (handlerID in memorize.handler) {
                            if (memorize.handler.hasOwnProperty(handlerID)) {
                                if (typeof memorize.handler[handlerID] == 'function') {
                                    memorize.handler[handlerID].apply(this, arguments);
                                }
                            }
                        }
                    };
                }
                memorize = element.memorize[type];
                memorize.id++;
                id = 'func' + memorize.id;
                memorize.handler[id] = handler;
                return id;
            };
            _interface.remove = function (element, type, handlerID) {
                type = 'on' + type;
                if (element.memorize && element.memorize[type] && element.memorize[type].handler[handlerID]) {
                    element.memorize[type].handler[handlerID] = undefined;
                }
                return true;
            };
        }

        return _interface;

    })();

})(this);
