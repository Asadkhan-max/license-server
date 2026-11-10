
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// LICENSE DATABASE (Use a real DB in production)
// ============================================
const licenses = {
    "almuhannaboss-XXXX-1234-ABCD": {
        user: "User1",
        active: true,
        expiresAt: "2026-11-11",
        maxDevices: 1,
        activeDevices: [],
        createdAt: "2026-11-10"
    },
    "almuhannaboss-XXXX-5678-EFGH": {
        user: "User2",
        active: true,
        expiresAt: "2026-11-11",
        maxDevices: 1,
        activeDevices: [],
        createdAt: "2026-11-10"
    }
};

// ============================================
// MIDDLEWARE: Rate Limiting (simple in-memory)
// ============================================
const rateLimitMap = {};
function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 60000);
    if (rateLimitMap[ip].length >= 30) {
        return res.status(429).json({ valid: false, error: "Too many requests" });
    }
    rateLimitMap[ip].push(now);
    next();
}

// ============================================
// ROUTE: Validate License
// ============================================
app.post('/api/validate', rateLimit, (req, res) => {
    const { licenseKey, deviceFingerprint } = req.body;

    if (!licenseKey || !deviceFingerprint) {
        return res.status(400).json({ valid: false, error: "Missing parameters" });
    }

    const license = licenses[licenseKey];

    if (!license) {
        return res.status(403).json({ valid: false, error: "Invalid license key" });
    }
    if (!license.active) {
        return res.status(403).json({ valid: false, error: "License has been revoked" });
    }
    if (new Date(license.expiresAt) < new Date()) {
        return res.status(403).json({ valid: false, error: "License has expired" });
    }

    if (!license.activeDevices.includes(deviceFingerprint)) {
        if (license.activeDevices.length >= license.maxDevices) {
            return res.status(403).json({
                valid: false,
                error: "Device limit reached. Deactivate another device first."
            });
        }
        license.activeDevices.push(deviceFingerprint);
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');

    return res.json({
        valid: true,
        user: license.user,
        expiresAt: license.expiresAt,
        token: sessionToken
    });
});

// ============================================
// ROUTE: Serve the Protected GRASS Script
// ============================================
app.get('/api/script', rateLimit, (req, res) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('// Unauthorized');
    }

    // =============================================
    // YOUR ACTUAL GRASS TO CSV EXPORTER SCRIPT
    // =============================================
    const scriptCode = `
(function() {
    'use strict';

    // ============================================
    // STATIC ROWS
    // ============================================
    var SHIP_FROM_ROW = "1|SHIP_FROM|RUH8 Return Center|Amazon KSA Returns Department|Istanbul Street||Agility Logistics Park|RNMA7347|14327|Riyadh|Sulay||SA|amazonreturns@amazon.com|O|966|598854905||||||||||||";

    var SHIP_TO_MAP = {
        "eu": "1|SHIP_TO|Returns Department|Amazon EU - BTS2|AMAZONSKA 4753/1||||92601|Sered|||SK|transportation@amazon.com||421|800226622|||||||||||||",
        "us": "1|SHIP_TO|Amazon US - LAS2|Amazon Returns Department|3837 Bay Lake Trail||Ste 113||89030|Las Vegas||Nevada|US|transportation@amazon.com||1|8882803321|||||||||||||",
        "auh": "1|SHIP_TO|c/o Amazon AE - AUH1|Q Tech General Trading LLC|Plot 159SR50 - Adh Dhirwah 6 St - ICAD III||Abu Dhabi Industrial City|||Abu Dhabi||Abu Dhabi|AE|transportation@amazon.com||971|43479184|||||||||||||"
    };

    var COUNTRY_OF_ORIGIN_MAP = {
        "eu": "SK",
        "us": "US",
        "auh": "AE"
    };

    var SHIPPER_ACCOUNT_MAP = {
        "eu": "407409721",
        "us": "940844287",
        "auh": "454295225"
    };

    var EXTRA_SERVICE_ROW = "1|EXTRA_SERVICE||Y||||||||||||||||||||||||Y||||||||||||||";

    var CARRIER = "WPX";
    var STATIC_LPN = "LPNSA0019656094";

    var selectedRowIndex = null;

    function getTodayFormatted() {
        var now = new Date();
        var yyyy = now.getFullYear();
        var mm = String(now.getMonth() + 1).padStart(2, '0');
        var dd = String(now.getDate()).padStart(2, '0');
        return '' + yyyy + mm + dd;
    }

    var storageKey = 'grassExporterData_' + (new URLSearchParams(window.location.search).get('id') || 'default');
    var collectedData = JSON.parse(sessionStorage.getItem(storageKey) || '{}');

    function saveData(newData) {
        var keys = Object.keys(newData);
        for (var k = 0; k < keys.length; k++) {
            if (newData[keys[k]]) {
                collectedData[keys[k]] = newData[keys[k]];
            }
        }
        sessionStorage.setItem(storageKey, JSON.stringify(collectedData));
        updateButtonStatus();
    }

    function clearData() {
        collectedData = {};
        selectedRowIndex = null;
        sessionStorage.removeItem(storageKey);
        var hsInput = document.getElementById('grassHSCodeInput');
        if (hsInput) hsInput.value = '';
        clearRowHighlights();
        updateButtonStatus();
    }

    function cleanTitle(title) {
        if (!title) return '';
        return title.replace(/[^a-zA-Z\\u00C0-\\u024F]/g, '');
    }

    function getAllElements(root) {
        var elements = [];
        var children = root.querySelectorAll('*');
        for (var i = 0; i < children.length; i++) {
            elements.push(children[i]);
            if (children[i].shadowRoot) {
                var shadowChildren = getAllElements(children[i].shadowRoot);
                for (var j = 0; j < shadowChildren.length; j++) {
                    elements.push(shadowChildren[j]);
                }
            }
        }
        return elements;
    }

    function getDeepText(root) {
        var allEls = getAllElements(root || document);
        return allEls;
    }

    function getFieldDeep(label) {
        var allEls = getAllElements(document);

        for (var i = 0; i < allEls.length; i++) {
            var el = allEls[i];
            if (el.tagName === 'TR') {
                var cells = el.querySelectorAll('td, th');
                for (var c = 0; c < cells.length - 1; c++) {
                    if (cells[c].textContent.trim() === label) {
                        return cells[c + 1].textContent.trim();
                    }
                }
            }
        }

        for (var i2 = 0; i2 < allEls.length; i2++) {
            var el2 = allEls[i2];
            var tag = el2.tagName ? el2.tagName.toLowerCase() : '';
            if (['dt', 'th', 'label', 'strong', 'b', 'span', 'div'].indexOf(tag) >= 0) {
                var directText = '';
                for (var cn = 0; cn < el2.childNodes.length; cn++) {
                    if (el2.childNodes[cn].nodeType === 3) {
                        directText += el2.childNodes[cn].textContent;
                    }
                }
                if (!directText.trim()) directText = el2.textContent;

                if (directText.trim() === label) {
                    var next = el2.nextElementSibling;
                    if (next) {
                        var val = next.textContent.trim();
                        if (val) return val;
                    }
                    var parent = el2.parentElement;
                    if (parent && parent.nextElementSibling) {
                        var val2 = parent.nextElementSibling.textContent.trim();
                        if (val2) return val2;
                    }
                }
            }
        }

        return '';
    }

    function findTableData(headerNames) {
        var allEls = getAllElements(document);
        var result = {};

        for (var i = 0; i < allEls.length; i++) {
            if (allEls[i].tagName === 'TABLE' || (allEls[i].tagName && allEls[i].tagName.toLowerCase() === 'table')) {
                var table = allEls[i];
                var ths = table.querySelectorAll('th');
                var headerMap = {};
                var foundAny = false;

                for (var h = 0; h < ths.length; h++) {
                    var hText = ths[h].textContent.trim();
                    if (headerNames.indexOf(hText) >= 0) {
                        headerMap[hText] = h;
                        foundAny = true;
                    }
                }

                if (foundAny) {
                    var rows = table.querySelectorAll('tbody tr');
                    var rowIdx = (selectedRowIndex !== null && selectedRowIndex < rows.length) ? selectedRowIndex : 0;
                    if (rows.length > rowIdx) {
                        var cells = rows[rowIdx].querySelectorAll('td');
                        for (var hName in headerMap) {
                            var idx = headerMap[hName];
                            if (cells[idx]) {
                                result[hName] = cells[idx].textContent.trim();
                            }
                        }
                    }
                    if (Object.keys(result).length > 0) return result;
                }
            }
        }

        return result;
    }

    function clearRowHighlights() {
        var allEls = getAllElements(document);
        for (var i = 0; i < allEls.length; i++) {
            if (allEls[i].tagName === 'TR' && allEls[i].getAttribute('data-grass-selected')) {
                allEls[i].style.outline = '';
                allEls[i].style.backgroundColor = '';
                allEls[i].removeAttribute('data-grass-selected');
            }
        }
    }

    function attachRowClickListeners() {
        var allEls = getAllElements(document);

        for (var i = 0; i < allEls.length; i++) {
            if (allEls[i].tagName === 'TABLE' || (allEls[i].tagName && allEls[i].tagName.toLowerCase() === 'table')) {
                var table = allEls[i];
                var ths = table.querySelectorAll('th');
                var hasTitle = false;

                for (var h = 0; h < ths.length; h++) {
                    if (ths[h].textContent.trim() === 'Title') {
                        hasTitle = true;
                        break;
                    }
                }

                if (hasTitle) {
                    var rows = table.querySelectorAll('tbody tr');
                    for (var r = 0; r < rows.length; r++) {
                        if (rows[r].getAttribute('data-grass-listener')) continue;
                        rows[r].setAttribute('data-grass-listener', 'true');
                        rows[r].style.cursor = 'pointer';

                        (function(row, rowIndex) {
                            row.addEventListener('click', function(e) {
                                if (e.target.tagName === 'A') return;
                                clearRowHighlights();
                                row.style.outline = '2px solid #FF9900';
                                row.style.backgroundColor = '#FFF8E7';
                                row.setAttribute('data-grass-selected', 'true');
                                selectedRowIndex = rowIndex;
                                console.log('[GRASS Exporter] Row ' + (rowIndex + 1) + ' selected');
                                scrapeOverviewTab();
                                scrapeCurrentPage();
                            });
                        })(rows[r], r);
                    }
                }
            }
        }
    }

    function detectDestination(shipOption) {
        if (!shipOption) return '';
        var opt = shipOption.toLowerCase();
        if (opt.indexOf('us') >= 0) return 'us';
        if (opt.indexOf('eu') >= 0) return 'eu';
        if (opt.indexOf('auh') >= 0 || opt.indexOf('ae') >= 0) return 'auh';
        return '';
    }

    function scrapeOverviewTab() {
        var scraped = {};
        var tableData = findTableData(['Title', 'OurPrice', 'Qty', 'ASIN']);

        if (tableData['Title']) {
            var titleText = tableData['Title'];
            if (titleText.indexOf('generated using') === -1 && titleText.indexOf('Shipment ') !== 0 && titleText.indexOf('[') !== 0) {
                scraped.title = titleText;
            }
        }

        if (tableData['OurPrice']) {
            var priceRaw = tableData['OurPrice'];
            var match = priceRaw.match(/([\\d.]+)\\s*([A-Z]{3})/);
            if (match) {
                scraped.price = match[1];
                scraped.currency = match[2];
            }
        }

        if (tableData['Qty']) {
            var qtyText = tableData['Qty'];
            if (qtyText.match(/^\\d+$/)) {
                scraped.qty = qtyText;
            }
        }

        if (!scraped.title) {
            var t = getFieldDeep('Title');
            if (t && t.indexOf('generated using') === -1 && t.indexOf('Shipment ') !== 0 && t.indexOf('[') !== 0 && t.length > 3) {
                scraped.title = t;
            }
        }
        if (!scraped.price) {
            var p = getFieldDeep('OurPrice');
            if (p) {
                var m = p.match(/([\\d.]+)\\s*([A-Z]{3})/);
                if (m) {
                    scraped.price = m[1];
                    scraped.currency = m[2];
                }
            }
        }

        if (Object.keys(scraped).length > 0) {
            console.log('[GRASS Exporter] Overview scraped:', scraped);
            saveData(scraped);
        }
        return scraped;
    }

    function scrapePackageDetails() {
        var scraped = {};
        var dimensions = getFieldDeep('Dimensions');
        var scaleWeight = getFieldDeep('Scale Weight');
        var shipperId = getFieldDeep('Shipper Id');

        if (dimensions) {
            scraped.dimensions = dimensions;
            var dimMatch = dimensions.match(/([\\d.]+)\\s*x\\s*([\\d.]+)\\s*x\\s*([\\d.]+)/i);
            if (dimMatch) {
                scraped.dimL = dimMatch[1];
                scraped.dimW = dimMatch[2];
                scraped.dimH = dimMatch[3];
            }
        }

        if (scaleWeight) {
            scraped.scaleWeight = scaleWeight;
            var weightMatch = scaleWeight.match(/([\\d.]+)/);
            if (weightMatch) scraped.weight = weightMatch[1];
        }

        if (shipperId) {
            scraped.shipperId = shipperId;
            scraped.tid = shipperId;
        }

        if (Object.keys(scraped).length > 0) {
            console.log('[GRASS Exporter] Package scraped:', scraped);
            saveData(scraped);
        }
        return scraped;
    }

    function scrapeShipOption() {
        var scraped = {};
        var shipOption = getFieldDeep('Customer Ship Option');
        if (shipOption) {
            scraped.customerShipOption = shipOption;
            scraped.destination = detectDestination(shipOption);
            console.log('[GRASS Exporter] Ship Option scraped:', shipOption);
            saveData(scraped);
        }
        return scraped;
    }

    function scrapeOrderId() {
        var scraped = {};
        var allEls = getAllElements(document);

        for (var i = 0; i < allEls.length; i++) {
            var text = allEls[i].textContent.trim();
            var match = text.match(/^Order\\s*:\\s*(\\d{3}-\\d{7}-\\d{7})$/);
            if (match) {
                scraped.orderId = match[1];
                console.log('[GRASS Exporter] Order ID scraped:', scraped.orderId);
                saveData(scraped);
                return scraped;
            }
        }

        for (var j = 0; j < allEls.length; j++) {
            var el = allEls[j];
            var tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(tag) >= 0) {
                var hMatch = el.textContent.trim().match(/(\\d{3}-\\d{7}-\\d{7})/);
                if (hMatch) {
                    scraped.orderId = hMatch[1];
                    console.log('[GRASS Exporter] Order ID from heading:', scraped.orderId);
                    saveData(scraped);
                    return scraped;
                }
            }
        }

        return scraped;
    }

    function scrapeCurrentPage() {
        scrapeOverviewTab();
        scrapePackageDetails();
        scrapeShipOption();
        scrapeOrderId();
        attachRowClickListeners();
    }

    function getMissingFields() {
        var missing = [];
        if (!collectedData.title) missing.push('Title (Overview tab)');
        if (!collectedData.price) missing.push('OurPrice (Overview tab)');
        if (!collectedData.dimensions) missing.push('Dimensions (Package Details)');
        if (!collectedData.weight) missing.push('Scale Weight (Package Details)');
        if (!collectedData.destination) missing.push('Customer Ship Option (Details tab)');
        if (!collectedData.hsCode) missing.push('HS Code (enter manually)');
        return missing;
    }

    function enforceMinWeight(w) {
        var num = parseFloat(w) || 0;
        if (num < 0.1) num = 0.1;
        return String(num);
    }

    function buildCSV() {
        var d = collectedData;
        var alphaTitle = cleanTitle(d.title || '');
        var todayDate = getTodayFormatted();
        var finalWeight = enforceMinWeight(d.weight);

        var shipToRow = SHIP_TO_MAP[d.destination];
        if (!shipToRow) {
            throw new Error('Unknown destination: "' + (d.destination || '') + '"');
        }

        var countryOfOrigin = COUNTRY_OF_ORIGIN_MAP[d.destination] || '';
        var shipperAccount = SHIPPER_ACCOUNT_MAP[d.destination] || '';

        var rows = [];
        rows.push(SHIP_FROM_ROW);
        rows.push(shipToRow);

        var shipment = [
            "1", "SHIPMENT", "",
            todayDate,
            "P", CARRIER, "", "",
            alphaTitle,
            d.orderId || '',
            d.price || '',
            d.currency || '',
            "", "",
            shipperAccount, shipperAccount, shipperAccount,
            "", "", "",
            "DDP", "COMMERCIAL",
            "", "",
            "P",
            "", "", "", "",
            "D", ""
        ];
        rows.push(shipment.join('|'));

        var packaging = [
            "1", "PACKAGING",
            finalWeight, "kg",
            d.dimL || '', d.dimW || '', d.dimH || '',
            "cm", "", "", ""
        ];
        rows.push(packaging.join('|'));

        var invoiceHeader = [
            "1", "INVOICE_HEADER", "COMMERCIAL",
            "INV_" + STATIC_LPN,
            todayDate,
            "", "", "", "", "", "", "", "", "", "",
            STATIC_LPN,
            "", "", "", ""
        ];
        rows.push(invoiceHeader.join('|'));

        rows.push(EXTRA_SERVICE_ROW);

        var invItem = [
            "1", "INV_ITEM",
            alphaTitle,
            d.hsCode || '',
            d.qty || '1',
            "PCS",
            d.price || '',
            d.currency || '',
            finalWeight, finalWeight,
            countryOfOrigin,
            "", "", "", ""
        ];
        rows.push(invItem.join('|'));

        return rows.join('\\n');
    }

    function downloadCSV(csvContent, filename) {
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function updateButtonStatus() {
        var statusDiv = document.getElementById('grassStatusDiv');
        var exportBtn = document.getElementById('grassExportBtn');
        if (!statusDiv || !exportBtn) return;

        var missing = getMissingFields();
        var collected = 6 - missing.length;
        var rowInfo = selectedRowIndex !== null ? ' (Row ' + (selectedRowIndex + 1) + ')' : ' (Row 1)';

        if (missing.length === 0) {
            exportBtn.style.backgroundColor = '#067D0E';
            exportBtn.textContent = 'Export to CSV (Ready!)';
            statusDiv.innerHTML = '<span style="color:#067D0E;">All ' + collected + '/6 fields collected!</span>' +
                '<br><span style="color:#232F3E;font-size:10px;">Destination: <b>' + (collectedData.destination || '').toUpperCase() + '</b>' + rowInfo + '</span>';
        } else {
            exportBtn.style.backgroundColor = '#FF9900';
            exportBtn.textContent = 'Export to CSV (' + collected + '/6)';
            statusDiv.innerHTML = '<span style="color:#cc0000;">Missing ' + missing.length + ':<br>' +
                missing.map(function(m) { return '- ' + m; }).join('<br>') + '</span>' +
                '<br><span style="color:#232F3E;font-size:10px;">' + rowInfo + '</span>';
        }
    }

    function addExportPanel() {
        var existing = document.getElementById('grassExporterPanel');
        if (existing) existing.remove();

        var panel = document.createElement('div');
        panel.id = 'grassExporterPanel';
        panel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:white;border:2px solid #FF9900;border-radius:10px;padding:12px 14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:Arial,sans-serif;min-width:240px;max-width:300px;';

        var titleBar = document.createElement('div');
        titleBar.textContent = 'GRASS CSV Exporter v6';
        titleBar.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;color:#232F3E;border-bottom:1px solid #eee;padding-bottom:6px;';
        panel.appendChild(titleBar);

        var statusDiv = document.createElement('div');
        statusDiv.id = 'grassStatusDiv';
        statusDiv.style.cssText = 'margin-bottom:10px;font-size:11px;line-height:1.4;';
        panel.appendChild(statusDiv);

        var hsLabel = document.createElement('label');
        hsLabel.textContent = 'HS Code:';
        hsLabel.style.cssText = 'display:block;font-size:11px;font-weight:bold;color:#232F3E;margin-bottom:3px;';
        panel.appendChild(hsLabel);

        var hsInput = document.createElement('input');
        hsInput.type = 'text';
        hsInput.id = 'grassHSCodeInput';
        hsInput.placeholder = 'Enter HS Code (e.g. 3304100000)';
        hsInput.value = collectedData.hsCode || '';
        hsInput.style.cssText = 'display:block;width:100%;padding:6px 8px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;';
        hsInput.addEventListener('input', function() {
            var val = hsInput.value.trim();
            if (val) {
                saveData({ hsCode: val });
            } else {
                delete collectedData.hsCode;
                sessionStorage.setItem(storageKey, JSON.stringify(collectedData));
                updateButtonStatus();
            }
        });
        panel.appendChild(hsInput);

        var previewBtn = document.createElement('button');
        previewBtn.textContent = 'Preview Data';
        previewBtn.style.cssText = 'display:block;width:100%;padding:6px;margin-bottom:6px;background:#f0f0f0;color:#333;border:1px solid #ccc;border-radius:6px;font-size:12px;cursor:pointer;';
        previewBtn.addEventListener('click', function() {
            var d = collectedData;
            var alphaTitle = cleanTitle(d.title || '');
            var dest = (d.destination || '(unknown)').toUpperCase();
            var coo = COUNTRY_OF_ORIGIN_MAP[d.destination] || '(unknown)';
            var sa = SHIPPER_ACCOUNT_MAP[d.destination] || '(unknown)';
            var rowInfo = selectedRowIndex !== null ? 'Row ' + (selectedRowIndex + 1) : 'Row 1 (default)';
            var previewWeight = enforceMinWeight(d.weight);
            var preview = 'Collected Data:\\n\\n' +
                'Selected: ' + rowInfo + '\\n' +
                'Title (raw): ' + (d.title || '(empty)') + '\\n' +
                'Title (clean): ' + (alphaTitle || '(empty)') + '\\n' +
                'Price: ' + (d.price || '(empty)') + ' ' + (d.currency || '') + '\\n' +
                'Qty: ' + (d.qty || '1') + '\\n' +
                'Order ID: ' + (d.orderId || '(empty)') + '\\n' +
                'Date: ' + getTodayFormatted() + ' (today)\\n' +
                'Dimensions: ' + (d.dimL || '?') + ' x ' + (d.dimW || '?') + ' x ' + (d.dimH || '?') + '\\n' +
                'Weight: ' + previewWeight + ' kg\\n' +
                'Ship Option: ' + (d.customerShipOption || '(empty)') + '\\n' +
                'Destination: ' + dest + '\\n' +
                'Country of Origin: ' + coo + '\\n' +
                'HS Code: ' + (d.hsCode || '(empty)') + '\\n' +
                'Shipper Account: ' + sa + '\\n' +
                'LPN: ' + STATIC_LPN + ' (static)';
            alert(preview);
        });
        panel.appendChild(previewBtn);

        var scanBtn = document.createElement('button');
        scanBtn.textContent = 'Scan This Page';
        scanBtn.style.cssText = 'display:block;width:100%;padding:8px;margin-bottom:6px;background:#232F3E;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;';
        scanBtn.addEventListener('click', function() {
            scanBtn.textContent = 'Scanning...';
            setTimeout(function() {
                scrapeCurrentPage();
                scanBtn.textContent = 'Scan This Page';
                var missing = getMissingFields();
                if (missing.length === 0) {
                    alert('All data collected! Destination: ' + (collectedData.destination || '').toUpperCase() + '. Click Export to download.');
                } else {
                    alert('Scan done! Still missing:\\n' + missing.join('\\n'));
                }
            }, 500);
        });
        panel.appendChild(scanBtn);

        var exportBtn = document.createElement('button');
        exportBtn.id = 'grassExportBtn';
        exportBtn.textContent = 'Export to CSV';
        exportBtn.style.cssText = 'display:block;width:100%;padding:8px;margin-bottom:6px;background:#FF9900;color:#000;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;';
        exportBtn.addEventListener('click', function() {
            var missing = getMissingFields();
            if (missing.length > 0) {
                alert('Still missing:\\n' + missing.join('\\n'));
                return;
            }
            try {
                var csv = buildCSV();
                var filename = 'shipment_' + (collectedData.orderId || 'unknown') + '_' + getTodayFormatted() + '.csv';
                downloadCSV(csv, filename);
                exportBtn.textContent = 'Downloaded!';
                setTimeout(function() { updateButtonStatus(); }, 2000);
            } catch(err) {
                alert('Error: ' + err.message);
            }
        });
        panel.appendChild(exportBtn);

        var clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear & New Shipment';
        clearBtn.style.cssText = 'display:block;width:100%;padding:5px;background:#f5f5f5;color:#666;border:1px solid #ddd;border-radius:6px;font-size:11px;cursor:pointer;';
        clearBtn.addEventListener('click', function() {
            clearData();
            alert('Data cleared!');
        });
        panel.appendChild(clearBtn);

        document.body.appendChild(panel);
        updateButtonStatus();
    }

    function init() {
        setTimeout(function() {
            addExportPanel();
            scrapeCurrentPage();
        }, 3000);

        var debounceTimer = null;
        var observer = new MutationObserver(function() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                scrapeCurrentPage();
            }, 1500);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
`;

    res.setHeader('Content-Type', 'application/javascript');
    res.send(scriptCode);
});

// ============================================
// ADMIN ROUTE: Revoke a License
// ============================================
app.post('/admin/revoke', (req, res) => {
    const { adminSecret, licenseKey } = req.body;

    if (adminSecret !== "YOUR_ADMIN_SECRET") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    if (licenses[licenseKey]) {
        licenses[licenseKey].active = false;
        licenses[licenseKey].activeDevices = [];
        return res.json({ success: true, message: `License ${licenseKey} revoked` });
    }

    return res.status(404).json({ error: "License not found" });
});

// ============================================
// ADMIN ROUTE: List All Licenses
// ============================================
app.get('/admin/licenses', (req, res) => {
    const { adminSecret } = req.query;

    if (adminSecret !== "YOUR_ADMIN_SECRET") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const summary = Object.entries(licenses).map(([key, data]) => ({
        licenseKey: key,
        user: data.user,
        active: data.active,
        expiresAt: data.expiresAt,
        devicesUsed: data.activeDevices.length,
        maxDevices: data.maxDevices
    }));

    return res.json(summary);
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`License server running on port ${PORT}`);
});

