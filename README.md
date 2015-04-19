UploadForm.js
=============

Javascript plugin to upload form data including files with XHR2 and IFrame fallback.

This plugin supports:
- XMLHttpRequest2 file upload with FormData
- IFrame Fallback
- Event Callbacks (beforesend, progress, load, error)
- abort and timeout
- Cross Domain (IFrame: postMessage, XHR: credentials)
- tested with >= IE7 but should even work >= IE6

#Install

```html
<script src="UploadForm.js"></script>
```

#Usage

###Example

```javascript
var uploadForm = new UploadForm('form', 'https://cross-domain.com/upload', {
	type: 'json', // 'text', 'json', 'xml'
	timeout: 5000,
	crossDomain: true,
	xhrCredentials: true
}).on('beforesend', function() {
	this.setHeader('X-Test', 'works');
	this.setData('extra', 'field');
}).on('progress', function(type, event) {
	if (event.lengthComputable) {
		var percentComplete = event.loaded / event.total;
	    if (type === 'upload') {
			// ...
		} else if (type === 'download') {
			// ...
		}
	}
}).on('load', function(response, xhr) {
	if (this.useIFrameFallback === false) {
		log(xhr);
	}
	// response - yeah!
}).on('error', function(type) {
	if (type === 'parseerror') {
		showParseError.apply(this, arguments);
	} else if (type === 'timeout') {
		showTimeout.apply(this, arguments);
	} else if (type === 'abort') {
		showAbort.apply(this, arguments);
	} else if (type === 'error') {
		showError.apply(this, arguments);
	}
});

function showParseError(errorMessage, originalText, xhr) {
	if (this.useIFrameFallback === false) {
		log(xhr);
	}
	if (this.type === 'json') {
		checkJSON(originalText, errorMessage);
	} else {
		// ...
	}
}

function showTimeout(xhr) {
	if (this.useIFrameFallback === false) {
		log(xhr);
	}
}

function showAbort(xhr) {
	if (this.useIFrameFallback === false) {
		log(xhr);
	}
}

function showError(errorMessage, xhr) {
	if (this.useIFrameFallback === false) {
		log(xhr);
	}
	log(errorMessage);
}
```
